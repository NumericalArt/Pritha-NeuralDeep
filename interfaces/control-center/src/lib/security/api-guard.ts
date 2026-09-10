const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type ApiGuardDecision =
  | {
      action: "allow";
      requestHeaders?: Headers;
    }
  | {
      action: "deny";
      error: string;
    };

export type ApiGuardInput = {
  url: string;
  method: string;
  headers: Headers;
  env?: Record<string, string | undefined>;
};

function stripBrackets(value: string) {
  return value.replace(/^\[(.*)\]$/, "$1");
}

export function normalizedHost(value: string | null | undefined) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";

  try {
    return stripBrackets(new URL(`http://${raw}`).hostname);
  } catch {
    // Fall through to conservative parsing for malformed-but-common host values.
  }

  if (raw.startsWith("[")) {
    const end = raw.indexOf("]");
    if (end > 0) return stripBrackets(raw.slice(0, end + 1));
  }

  const colonCount = (raw.match(/:/g) || []).length;
  if (colonCount === 1) return stripBrackets(raw.split(":")[0]);
  return stripBrackets(raw);
}

function normalizedAuthority(value: string | null | undefined) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  try {
    const url = new URL(`http://${raw}`);
    const host = stripBrackets(url.hostname);
    return url.port ? `${host}:${url.port}` : host;
  } catch {
    return normalizedHost(raw);
  }
}

function configuredTailnetHosts(env: Record<string, string | undefined>) {
  return [env.PRITHA_TAILNET_HOSTNAME, env.PRITHA_CONTROL_CENTER_TAILSCALE_HOST]
    .flatMap((value) => String(value || "").split(","))
    .map((value) => normalizedHost(value))
    .filter(Boolean);
}

function isLoopbackHost(host: string) {
  return LOOPBACK_HOSTS.has(stripBrackets(host));
}

function isTrustedTailnetHost(host: string, env: Record<string, string | undefined>) {
  const configured = configuredTailnetHosts(env);
  if (configured.length > 0) return configured.includes(host);
  return host.endsWith(".ts.net");
}

function allowedTailnetLogins(env: Record<string, string | undefined>) {
  return String(env.PRITHA_TAILSCALE_ALLOWED_LOGINS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function pathnameOf(url: string) {
  try {
    return new URL(url).pathname;
  } catch {
    return url.startsWith("/") ? url.split("?")[0] : "";
  }
}

function deny(error: string): ApiGuardDecision {
  return { action: "deny", error };
}

export function evaluateApiRequestGuard(input: ApiGuardInput): ApiGuardDecision {
  if (!pathnameOf(input.url).startsWith("/api/")) return { action: "allow" };

  const env = input.env || process.env;
  const hostHeader = input.headers.get("host");
  const host = normalizedHost(hostHeader);
  const authority = normalizedAuthority(hostHeader);
  const loopback = isLoopbackHost(host);
  const tailnet = isTrustedTailnetHost(host, env);

  if (!loopback && !tailnet) return deny("untrusted_host");

  if (MUTATING_METHODS.has(input.method.toUpperCase())) {
    const site = input.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") return deny("cross_site_blocked");

    const origin = input.headers.get("origin");
    if (origin) {
      try {
        const originAuthority = normalizedAuthority(new URL(origin).host);
        if (originAuthority !== authority) return deny("origin_mismatch");
      } catch {
        return deny("bad_origin");
      }
    }
  }

  if (tailnet) {
    const login = (input.headers.get("tailscale-user-login") || "").trim().toLowerCase();
    const allow = allowedTailnetLogins(env);
    if (!login || (allow.length > 0 && !allow.includes(login))) return deny("untrusted_tailscale_identity");
  }

  if (loopback && input.headers.has("tailscale-user-login")) {
    const requestHeaders = new Headers(input.headers);
    requestHeaders.delete("tailscale-user-login");
    return { action: "allow", requestHeaders };
  }

  return { action: "allow" };
}
