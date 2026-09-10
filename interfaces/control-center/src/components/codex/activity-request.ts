import { ControlCenterRequestError, controlCenterRequest } from "@/lib/control-center-request";
import type { HistoryItemsPage } from "@/lib/codex-chat/types";

const options = { timeoutMs: 35_000, maxBodyBytes: 256 * 1024 };
const expired = (error: unknown) => error instanceof ControlCenterRequestError && error.code === "history_cursor_expired";

export async function readActivityPage(chatId: string, turnId: string, cursor: string, initial: string | null, signal: AbortSignal) {
  const base = `/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/history`;
  const read = async (ref: string) => {
    const result = await controlCenterRequest<HistoryItemsPage>(`${base}/turns/${encodeURIComponent(turnId)}/items?cursor=${encodeURIComponent(ref)}&view=activity`, { signal }, options);
    if (result.data.nextCursor === ref) throw new Error("Activity returned a repeated position.");
    return result.data;
  };
  try { return { page: await read(cursor), recovered: false }; }
  catch (error) { if (!expired(error) || signal.aborted) throw error; }
  // An older page can outlive its snapshot. Restart from the same turn's tail.
  if (initial && initial !== cursor) {
    try { return { page: await read(initial), recovered: true }; }
    catch (error) { if (!expired(error) || signal.aborted) throw error; }
  }
  // A server restart also invalidates the initial signature. Get a new reference
  // from one bounded page, matching the exact turn; never guess a native identity.
  type ReferenceTurn = { turnId: string; history?: { itemsRef?: string; itemsCursor?: string | null } };
  const recent = (await controlCenterRequest<{ data: ReferenceTurn[] }>(`${base}?limit=20`, { signal }, options)).data;
  const history = recent.data.find(turn => turn.turnId === turnId)?.history;
  const fresh = history?.itemsRef || history?.itemsCursor;
  if (!fresh) throw new Error("Activity could not be refreshed.");
  return { page: await read(fresh), recovered: true };
}
