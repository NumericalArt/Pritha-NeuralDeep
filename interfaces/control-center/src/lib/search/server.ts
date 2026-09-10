import {
  SearchService,
  type SearchContext,
} from "../../../../../scripts/search/service.mjs";
import {
  resolvePrithaStateRoot,
  resolveTechscopeRoot,
} from "@/lib/pritha-paths";
const services = new Map<string, SearchService>();
export function searchService() {
  const root = resolveTechscopeRoot(),
    state = resolvePrithaStateRoot(root);
  const key = `${root}:${state}`;
  let service = services.get(key);
  if (!service) {
    service = new SearchService({
      codeRoot: root,
      stateRoot: state,
      instance: process.env.PRITHA_INSTANCE_ID,
    });
    services.set(key, service);
  }
  return service;
}
export function operatorContext(turn = "settings"): SearchContext {
  return { surface: "diagnostic", owner: "operator", turn, explicit: true };
}
export function searchFailure(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "search_unavailable";
  return { ok: false, error: code };
}
export async function boundedBody(request: Request) {
  if (Number(request.headers.get("content-length")) > 16384)
    throw new Error("invalid_request");
  const reader = request.body?.getReader();
  if (!reader) return {};
  let size = 0;
  const parts: Uint8Array[] = [];
  try {
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > 16384) throw new Error("invalid_request");
      parts.push(r.value);
    }
    return JSON.parse(Buffer.concat(parts).toString());
  } finally {
    await reader.cancel().catch(() => {});
  }
}
