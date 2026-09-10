"use client";
import { useEffect, useState } from "react";
import { SearchResearchPanel } from "./SearchResearchPanel";
import { Search, RefreshCw } from "lucide-react";
import type {
  SearchSettings,
  SearchStatus,
} from "../../../../../scripts/search/service.mjs";
export function SearchSettingsSection() {
  const [status, setStatus] = useState<SearchStatus | null>(null),
    [draft, setDraft] = useState<SearchSettings | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function load() {
    setBusy(true);
    try {
      const r = await fetch("/api/settings/search", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok || !d.ok) throw Error(d.error || "Search unavailable");
      setStatus(d);
      setDraft(d.settings);
    } catch {
      setMessage("Search settings unavailable. Retry.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function action(kind: "save" | "quota" | "search") {
    if (!draft) return;
    setBusy(true);
    setMessage("");
    try {
      const { revision, ...patch } = draft;
      const r = await fetch(
        kind === "save"
          ? "/api/settings/search"
          : "/api/settings/search/diagnostics",
        {
          method: kind === "save" ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            kind === "save" ? { patch, expectedRevision: revision } : { kind },
          ),
        },
      );
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setMessage(
          r.status === 409
            ? "Settings changed elsewhere. Refresh before saving."
            : `Search: ${typeof d.error === "object" ? d.error.code : d.error || "unavailable"}`,
        );
        return;
      }
      await load();
      setMessage(
        kind === "save"
          ? "Search settings saved."
          : kind === "search"
            ? `Search test: ${d.sources?.length || 0} sources, ${d.elapsed_ms} ms.`
            : "Quota checked.",
      );
    } catch {
      setMessage(
        "Connection failed; settings were not confirmed. Refresh to inspect.",
      );
    } finally {
      setBusy(false);
    }
  }
  const update = (patch: Partial<SearchSettings>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));
  const numberFields: [keyof SearchSettings, string, number, number][] = [
    ["searchTimeoutMs", "Search timeout (ms)", 1000, 15000],
    ["crawlTimeoutMs", "Read timeout (ms)", 1000, 30000],
    ["taskSearch", "Searches per chat turn", 1, 10],
    ["taskRead", "Pages per chat turn", 0, 8],
    ["voiceSearch", "Searches per voice turn", 1, 3],
    ["voiceRead", "Pages per voice turn", 0, 2],
    ["childSearch", "Searches per child turn", 1, 10],
    ["childRead", "Pages per child turn", 0, 8],
    ["searchCacheMs", "Search cache (ms)", 0, 300000],
    ["pageCacheMs", "Page cache (ms)", 0, 1800000],
  ];
  const quota = (value: any) => {
    const q = value?.day ? value : value?.[value?.pool];
    return q?.day
      ? `${q.day.remaining ?? "?"} / ${q.day.limit ?? "?"} daily · ${q.month?.remaining ?? "?"} / ${q.month?.limit ?? "?"} monthly · resets ${q.day.reset_at || "unknown"}`
      : "Not checked";
  };
  return (
    <section
      className="settings-section"
      id="search-settings"
      aria-label="Search settings"
    >
      <div className="settings-section-row">
        <div className="section-header">
          <span className="section-icon">
            <Search size={22} />
          </span>
          <div>
            <h2>Search</h2>
            <p>Shared web search for Chat, Voice and agents</p>
          </div>
        </div>
        <button
          className="outline-button"
          disabled={busy}
          onClick={() => void load()}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      <p role="status">{message}</p>
      {!draft ? (
        <p>Loading search settings…</p>
      ) : (
        <>
          <div className="settings-rowline">
            <label>
              <input
                type="checkbox"
                checked={draft.enabled}
                disabled={busy}
                onChange={(e) => update({ enabled: e.target.checked })}
              />{" "}
              Enable web search
            </label>
            <span>Connection: {status?.health || "unknown"}</span>
          </div>
          <p className="info-note">
            Queries are sent to the selected provider. NeuralDeep uses your
            existing Keychain credential. This switch controls search tools; it
            does not change shell network permissions. Sources may be incomplete
            or outdated.
          </p>
          <div className="settings-rowline">
            <label>
              Primary provider{" "}
              <select
                aria-label="Search provider"
                value={draft.provider}
                onChange={(e) =>
                  update({
                    provider: e.target.value as SearchSettings["provider"],
                  })
                }
              >
                <option value="neuraldeep">NeuralDeep</option>
                <option value="searxng">SearXNG</option>
              </select>
            </label>
            <label>
              Search mode{" "}
              <select
                aria-label="Search mode"
                value={draft.mode}
                onChange={(e) =>
                  update({ mode: e.target.value as SearchSettings["mode"] })
                }
              >
                <option value="requested">Only when requested</option>
                <option value="auto">Auto when needed</option>
                <option value="off">Off</option>
              </select>
            </label>
          </div>
          <div className="settings-rowline">
            {(["task_chat", "voice", "child", "research"] as const).map(
              (surface) => (
                <label key={surface}>
                  <input
                    type="checkbox"
                    checked={draft.surfaces[surface]}
                    onChange={(e) =>
                      update({
                        surfaces: {
                          ...draft.surfaces,
                          [surface]: e.target.checked,
                        },
                      })
                    }
                  />
                  {
                    {
                      task_chat: "Task Chat",
                      voice: "Voice Control",
                      child: "Child agents",
                      research: "Deep Research",
                    }[surface]
                  }
                </label>
              ),
            )}
          </div>
          <p>
            Credential: {status?.credential.status || "unchecked"} ·{" "}
            <a href="#neuraldeep-keys">NeuralDeep keys</a>. Configure a key
            there, then check Search quota here.
          </p>
          <label>
            Allowed child agent IDs{" "}
            <input
              aria-label="Allowed child agents"
              value={draft.childAllowlist.join(", ")}
              onChange={(e) =>
                update({
                  childAllowlist: e.target.value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean),
                })
              }
              placeholder="brief-desk-nd"
            />
          </label>
          <details>
            <summary>Budgets, cache and fallback</summary>
            <div className="search-control-grid">
              {numberFields.map(([key, label, min, max]) => (
                <label key={key}>
                  {label}
                  <input
                    aria-label={label}
                    type="number"
                    min={min}
                    max={max}
                    value={Number(draft[key])}
                    onChange={(e) => update({ [key]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
            <div className="settings-rowline">
              <label>
                SearXNG endpoint{" "}
                <input
                  aria-label="SearXNG endpoint"
                  value={draft.searxngUrl}
                  onChange={(e) => update({ searxngUrl: e.target.value })}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.fallback}
                  onChange={(e) => update({ fallback: e.target.checked })}
                />{" "}
                Fallback to healthy SearXNG
              </label>
            </div>
            <p>
              Fallback requires a successful SearXNG test within five minutes.
              Search never installs or starts SearXNG. Deep Research: 10
              searches, 8 pages, 10 model calls, 5 active minutes.
            </p>
          </details>
          <div className="settings-rowline">
            <button
              className="outline-button"
              disabled={busy}
              onClick={() => void action("save")}
            >
              Save search settings
            </button>
            <button
              className="outline-button"
              disabled={busy}
              onClick={() => void action("quota")}
            >
              Check NeuralDeep quota
            </button>
            <button
              className="outline-button"
              disabled={busy || !status?.settings.enabled}
              onClick={() => void action("search")}
            >
              Test search (uses quota)
            </button>
          </div>
          <p>
            Last diagnostic:{" "}
            {status?.diagnostic?.checkedAt
              ? new Date(status.diagnostic.checkedAt).toLocaleString()
              : "Not checked"}{" "}
            · {status?.health || "unknown"}
          </p>
          <div className="settings-rowline">
            <div>
              <strong>NeuralDeep Search quota</strong>
              <p>{quota(status?.quota?.search)}</p>
            </div>
            <div>
              <strong>NeuralDeep Crawl quota</strong>
              <p>{quota(status?.quota?.crawl)}</p>
            </div>
          </div>
          <p>
            Quota snapshot:{" "}
            {status?.quota?.checkedAt
              ? new Date(status.quota.checkedAt).toLocaleString()
              : "unknown"}{" "}
            · Shared with other users of the credential. Money cost is not
            inferred from provider cost units.
          </p>
          <details>
            <summary>Recent operations</summary>
            {status?.history.length ? (
              <ul>
                {status.history.map((op: any) => (
                  <li key={op.id}>
                    {op.kind} · {op.provider} · {op.status} ·{" "}
                    {op.elapsed ?? "—"} ms {op.error ? `· ${op.error}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                No diagnostic operations yet. Chat operations appear in their
                tool activity.
              </p>
            )}
          </details>
          <SearchResearchPanel />
        </>
      )}
    </section>
  );
}
