import type { ControlCenterStatus } from "@/lib/control-center/types";

export type AccessMode = "localhost" | "lan" | "tailscale";

export const ACCESS_MODE_STORAGE_KEY = "pritha.defaultAccessMode";
export const ACCESS_MODE_CHANGED_EVENT = "pritha:default-access-mode-changed";

export function isAccessMode(value: unknown): value is AccessMode {
  return value === "localhost" || value === "lan" || value === "tailscale";
}

export function accessModeReady(access: ControlCenterStatus["access"], mode: AccessMode) {
  if (mode === "localhost") return Boolean(access.localhost);
  if (mode === "lan") return access.lan === "ready" && Boolean(access.lanUrl);
  return access.tailscale === "ready" && Boolean(access.tailscaleUrl);
}

export function preferredAccessMode(access: ControlCenterStatus["access"], requested?: AccessMode): AccessMode {
  if (requested && accessModeReady(access, requested)) return requested;
  if (accessModeReady(access, "tailscale")) return "tailscale";
  if (accessModeReady(access, "lan")) return "lan";
  return "localhost";
}

export function readStoredAccessMode(): AccessMode | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const value = window.localStorage?.getItem(ACCESS_MODE_STORAGE_KEY);
    if (isAccessMode(value)) return value;
  } catch {
    // Browser storage can be unavailable in hardened or embedded contexts.
  }
  const cookieValue = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${ACCESS_MODE_STORAGE_KEY}=`))
    ?.split("=")[1];
  const decoded = cookieValue ? decodeURIComponent(cookieValue) : undefined;
  return isAccessMode(decoded) ? decoded : undefined;
}

export function writeStoredAccessMode(mode: AccessMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(ACCESS_MODE_STORAGE_KEY, mode);
  } catch {
    // Cookie fallback below keeps same-tab navigation behavior working.
  }
  document.cookie = `${ACCESS_MODE_STORAGE_KEY}=${encodeURIComponent(mode)}; Path=/; SameSite=Lax; Max-Age=31536000`;
  window.dispatchEvent(new CustomEvent(ACCESS_MODE_CHANGED_EVENT, { detail: mode }));
}

export function accessBaseUrl(access: ControlCenterStatus["access"], mode: AccessMode) {
  if (mode === "tailscale") return access.tailscaleUrl;
  if (mode === "lan") return access.lanUrl;
  return access.localhost;
}

export function accessVoiceUrl(access: ControlCenterStatus["access"], mode: AccessMode) {
  const baseUrl = accessBaseUrl(access, mode);
  if (!baseUrl) return undefined;
  return `${baseUrl.replace(/\/$/, "")}/voice`;
}

function isLocalHttpUrl(url: URL) {
  return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
}

export function agentUrlForAccessMode(rawUrl: string | undefined, access: ControlCenterStatus["access"], mode: AccessMode, agentTailscaleUrl?: string) {
  if (mode === "tailscale") return agentTailscaleUrl;
  if (!rawUrl) return undefined;
  let source: URL;
  try {
    source = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  if (!isLocalHttpUrl(source)) return rawUrl;
  if (mode === "localhost") return rawUrl;

  const targetBase = accessBaseUrl(access, mode);
  if (!targetBase) return rawUrl;
  try {
    const target = new URL(targetBase);
    const next = new URL(rawUrl);
    next.protocol = target.protocol;
    next.hostname = target.hostname;
    next.port = source.port || target.port;
    return next.toString().replace(/\/$/, "");
  } catch {
    return rawUrl;
  }
}
