import { SearchStore, hash } from "./store.mjs";
import { SearchInput, PageInput, SearchError, fail } from "./contracts.mjs";
import { NeuralDeepProvider, SearxngProvider } from "./provider.mjs";
import { publicUrl, verifyPublicUrl, safeDate } from "./policy.mjs";
import { readChildPage } from "./child-reader.mjs";
import { randomUUID } from "node:crypto";
const active = new Map();
async function abortable(work, signal) {
  if (signal.aborted) throw signal.reason;
  let listener;
  try {
    return await Promise.race([
      work,
      new Promise((_, reject) => {
        listener = () => reject(signal.reason);
        signal.addEventListener("abort", listener, { once: true });
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", listener);
  }
}
export class SearchService {
  constructor(options) {
    this.stateRoot = options.stateRoot;
    this.codeRoot = options.codeRoot;
    this.store = options.store || new SearchStore(options);
    this.instance = options.instance || "pritha";
    this.providers = options.providers || {};
    this.verifyUrl = options.verifyUrl || verifyPublicUrl;
  }
  provider(name, settings) {
    return (
      this.providers[name] ||
      (name === "neuraldeep"
        ? new NeuralDeepProvider()
        : new SearxngProvider(settings.searxngUrl))
    );
  }
  context(c) {
    if (
      !c ||
      !["task_chat", "voice", "child", "research", "diagnostic"].includes(
        c.surface,
      ) ||
      !c.owner ||
      !c.turn ||
      c.owner.length > 200 ||
      c.turn.length > 200
    )
      fail("permission_denied");
    return { ...c, instance: this.instance };
  }
  allowed(c, s) {
    if (!s.enabled || s.mode === "off") fail("disabled");
    if (c.surface === "diagnostic") return;
    if (!s.surfaces[c.surface]) fail("permission_denied");
    if (c.surface === "child" && !s.childAllowlist.includes(c.owner))
      fail("permission_denied");
    if (s.mode === "requested" && !c.explicit) fail("permission_denied");
  }
  getStatus(context) {
    const c = this.context(context),
      s = this.store.settings(),
      diag = this.store.meta(`health:${s.provider}`);
    return {
      settings: s,
      health:
        !diag || (s.provider === "searxng" && diag.endpoint !== s.searxngUrl)
          ? "unknown"
          : Date.now() - diag.checkedAt > 300000
            ? "stale"
            : diag.ok
              ? "healthy"
              : "unavailable",
      diagnostic: diag,
      quota: this.store.meta("quota"),
      history: this.store.history(c.surface === "diagnostic" ? null : c.owner),
      capabilities: {
        search: true,
        read: s.provider === "neuraldeep",
        research: true,
      },
      credential: {
        source: "macos_keychain",
        status: diag?.credentialStatus || "unchecked",
      },
    };
  }
  configure(patch, revision) {
    const s = this.store.configure(patch, revision);
    for (const [controller, { service, context }] of active)
      if (service.store.directory === this.store.directory) {
        try {
          service.allowed(context, s);
        } catch {
          controller.abort(new SearchError("disabled"));
        }
      }
    this.store.transaction(() => {
      for (const row of this.store.db
        .prepare("SELECT value FROM jobs WHERE state IN ('queued','running')")
        .all()) {
        const job = JSON.parse(row.value);
        if (
          s.enabled &&
          s.mode !== "off" &&
          s.surfaces.research &&
          s.surfaces[job.originSurface || "research"]
        )
          continue;
        job.state = job.state === "queued" ? "cancelled" : "cancelling";
        job.phase = job.state;
        job.updatedAt = Date.now();
        this.store.db
          .prepare("UPDATE jobs SET state=?,value=?,updated=? WHERE id=?")
          .run(job.state, JSON.stringify(job), job.updatedAt, job.id);
      }
    });
    return s;
  }
  async diagnose(input, context) {
    const c = this.context({
        ...context,
        surface: "diagnostic",
        explicit: true,
      }),
      s = this.store.settings();
    if (input.kind === "search")
      return this.search(
        {
          query: "site:neuraldeep.ru Search API documentation",
          max_results: 3,
        },
        c,
      );
    if (input.kind !== "quota")
      return { ok: false, error: { code: "invalid_request" } };
    const controller = new AbortController(),
      timer = setTimeout(
        () => controller.abort(new SearchError("timeout")),
        s.searchTimeoutMs,
      );
    try {
      const quota = await this.provider("neuraldeep", s).quota(
        controller.signal,
      );
      const snapshot = { ...quota, checkedAt: Date.now() };
      this.store.meta("quota", snapshot);
      this.store.meta("health:neuraldeep", {
        ok: true,
        checkedAt: Date.now(),
        credentialStatus: "configured",
      });
      return { ok: true, quota: snapshot };
    } catch (e) {
      const code = e.code || "provider_unavailable";
      this.store.meta("health:neuraldeep", {
        ok: false,
        checkedAt: Date.now(),
        error: code,
        credentialStatus:
          code === "credentials_missing" ? "missing" : "unchecked",
      });
      return { ok: false, error: { code } };
    } finally {
      clearTimeout(timer);
    }
  }
  search(input, context) {
    return this.run("search", input, context);
  }
  readPage(input, context) {
    return this.run("read", input, context);
  }
  async run(kind, input, context) {
    this.store.cleanup();
    const started = Date.now();
    let c, s, provider, id, controller, timer, poll, key;
    let warnings = [];
    const result = (status, sources = [], error = null, cached = false) => ({
      ok: ["ok", "partial", "empty"].includes(status),
      id: id || `search_${randomUUID()}`,
      status,
      provider: provider || s?.provider || null,
      sources,
      results: sources,
      elapsed_ms: Date.now() - started,
      retrieved_at: new Date().toISOString(),
      cached,
      warnings,
      error,
      quota: this.store.meta("quota"),
    });
    try {
      c = this.context(context);
      s = this.store.settings();
      this.allowed(c, s);
      provider = s.provider;
      const parsed = (kind === "search" ? SearchInput : PageInput).safeParse(
        input,
      );
      if (!parsed.success) fail("invalid_request");
      input = parsed.data;
      if (kind === "search")
        input.domains = input.domains.map((d) => d.toLowerCase());
      controller = new AbortController();
      active.set(controller, { service: this, context: c });
      const abort = () =>
        controller.abort(c.signal.reason || new SearchError("cancelled"));
      if (c.signal?.aborted) abort();
      else c.signal?.addEventListener("abort", abort, { once: true });
      controller.cleanup = () => c.signal?.removeEventListener("abort", abort);
      const timeout = kind === "search" ? s.searchTimeoutMs : s.crawlTimeoutMs;
      timer = setTimeout(
        () => controller.abort(new SearchError("timeout")),
        timeout,
      );
      poll = setInterval(() => {
        try {
          this.allowed(c, this.store.settings());
        } catch (e) {
          controller.abort(e);
        }
      }, 100);
      poll.unref();
      if (controller.signal.aborted) throw controller.signal.reason;
      if (kind === "read") {
        if (input.source_id) {
          const source = this.store.getSource(c, input.source_id);
          input.url = source.url;
          if (source.provider !== provider) fail("provider_unavailable");
        }
        input.url = await abortable(
          this.verifyUrl(input.url),
          controller.signal,
        );
      }
      key = hash([this.instance, c.owner, provider, s.revision, kind, input]);
      const cached =
        kind === "search" && input.freshness !== "any"
          ? null
          : this.store.getCache(key);
      if (cached) {
        this.allowed(c, this.store.settings());
        if (controller.signal.aborted) throw controller.signal.reason;
        warnings = cached.warnings;
        const sources = cached.sources.map((v) =>
          this.store.source(
            c,
            { ...v, id: undefined },
            kind === "search" ? 300000 : 1800000,
          ),
        );
        return {
          ...result(cached.status, sources, null, true),
          retrieved_at: cached.retrieved_at,
        };
      }
      const cooldown = this.store.meta(`cooldown:${provider}`);
      if (cooldown > Date.now())
        fail("quota_exceeded", {
          retryAfter: Math.ceil((cooldown - Date.now()) / 1000),
        });
      const prefix =
        c.surface === "voice"
          ? "voice"
          : c.surface === "child"
            ? "child"
            : "task";
      const limit =
        c.surface === "research"
          ? kind === "search"
            ? 10
            : 8
          : c.surface === "diagnostic"
            ? 1
            : s[`${prefix}${kind === "search" ? "Search" : "Read"}`];
      id = this.store.reserve(c, kind, provider, limit, timeout);
      let response;
      try {
        response =
          kind === "read" && c.surface === "child"
            ? await abortable(
                readChildPage(input.url, c.allowedHosts, controller.signal),
                controller.signal,
              )
            : await this.provider(provider, s)[
                kind === "search" ? "search" : "read"
              ](kind === "search" ? input : input.url, controller.signal);
      } catch (e) {
        const health = this.store.meta("health:searxng");
        if (
          kind === "search" &&
          provider === "neuraldeep" &&
          s.fallback &&
          ["provider_unavailable", "timeout"].includes(e.code) &&
          health?.ok &&
          health.endpoint === s.searxngUrl &&
          Date.now() - health.checkedAt < 300000 &&
          !controller.signal.aborted
        ) {
          this.store.finish(id, "failed", e.code);
          provider = "searxng";
          id = this.store.reserve(c, kind, provider, limit, timeout, true);
          response = await this.provider(provider, s).search(
            input,
            controller.signal,
          );
          warnings.push("fallback_searxng");
        } else throw e;
      }
      if (controller.signal.aborted) throw controller.signal.reason;
      this.allowed(c, this.store.settings());
      warnings.push(...(response.warnings || []));
      if (response.quota)
        this.store.meta("quota", {
          ...(this.store.meta("quota") || {}),
          [kind === "search" ? "search" : "crawl"]: response.quota,
          checkedAt: Date.now(),
        });
      const sources = [];
      let rejected = 0,
        malformed = 0;
      for (const item of response.items.slice(
        0,
        kind === "search" ? input.max_results : 1,
      )) {
        if (
          !item ||
          typeof item.url !== "string" ||
          typeof item.content !== "string"
        ) {
          malformed++;
          continue;
        }
        let url;
        try {
          url =
            kind === "read"
              ? await abortable(this.verifyUrl(item.url), controller.signal)
              : publicUrl(item.url);
        } catch {
          rejected++;
          continue;
        }
        if (
          kind === "search" &&
          input.domains.length &&
          !input.domains.some(
            (d) =>
              new URL(url).hostname === d ||
              new URL(url).hostname.endsWith(`.${d}`),
          )
        ) {
          rejected++;
          continue;
        }
        const max = kind === "read" ? input.max_chars : 1000;
        const v = {
          url,
          title: typeof item.title === "string" ? item.title.slice(0, 500) : "",
          snippet: kind === "search" ? item.content.slice(0, max) : null,
          text: kind === "read" ? item.content.slice(0, max) : null,
          published_at: safeDate(
            item.date || item.publishedDate || item.published_date,
          ),
          retrieved_at: new Date().toISOString(),
          read: kind === "read",
          truncated: item.content.length > max,
          untrusted: true,
          provider,
        };
        sources.push(
          this.store.source(
            c,
            v,
            c.surface === "research"
              ? 30 * 86400000
              : kind === "read"
                ? s.pageCacheMs || 1800000
                : s.searchCacheMs || 300000,
          ),
        );
      }
      if (controller.signal.aborted) throw controller.signal.reason;
      this.allowed(c, this.store.settings());
      if (malformed && malformed === response.items.length)
        fail("invalid_response");
      if (malformed) warnings.push("some_sources_malformed");
      if (kind === "read" && rejected && !sources.length) fail("url_blocked");
      if (rejected) warnings.push("some_sources_rejected");
      if (sources.some((v) => !v.published_at))
        warnings.push("publication_dates_unknown");
      const status = !sources.length ? "empty" : rejected ? "partial" : "ok";
      this.store.meta(`health:${provider}`, {
        ok: true,
        checkedAt: Date.now(),
        endpoint:
          provider === "searxng" ? s.searxngUrl : "https://api.neuraldeep.ru",
        credentialStatus:
          provider === "neuraldeep" ? "configured" : "not_required",
      });
      const out = result(status, sources);
      if (provider === s.provider)
        this.store.cache(
          key,
          out,
          kind === "search" ? s.searchCacheMs : s.pageCacheMs,
        );
      this.store.finish(id, status);
      return out;
    } catch (e) {
      const code =
        e?.code ||
        (e?.name === "AbortError" ? "cancelled" : "provider_unavailable");
      if (id) this.store.finish(id, "failed", code);
      if (
        provider &&
        [
          "auth_failed",
          "quota_exceeded",
          "provider_unavailable",
          "timeout",
        ].includes(code)
      )
        this.store.meta(`health:${provider}`, {
          ok: false,
          checkedAt: Date.now(),
          error: code,
        });
      if (provider && e.retryAfter)
        this.store.meta(
          `cooldown:${provider}`,
          Date.now() + e.retryAfter * 1000,
        );
      return result(
        ["cancelled", "disabled"].includes(code) && controller?.signal.aborted
          ? "cancelled"
          : "failed",
        [],
        { code, retry_after: e.retryAfter || null },
      );
    } finally {
      clearTimeout(timer);
      clearInterval(poll);
      if (controller) {
        controller.cleanup?.();
        active.delete(controller);
      }
    }
  }
}
