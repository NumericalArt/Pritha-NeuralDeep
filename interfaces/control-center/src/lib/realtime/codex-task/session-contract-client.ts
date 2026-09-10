import type { PrithaCodexTaskClient } from "./types";

export class PrithaCodexSessionContractClient implements PrithaCodexTaskClient {
  async runTask(): Promise<unknown> {
    return {
      status: "unavailable",
      text: "",
      data: {
        reason: "session_contract_transport_is_reserved_for_a_future_pritha_iteration",
      },
      errors: ["Codex session-contract transport is not implemented in Pritha v1."],
      warnings: ["The transport is intentionally present as a readable extension point."],
    };
  }
}
