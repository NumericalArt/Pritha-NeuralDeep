import { CodexAppServerClient } from "@/lib/codex-task/adapters/codex-app-server-client"
import { CodexAppThreadClient } from "@/lib/codex-task/adapters/codex-app-thread-client"
import { CodexAutoClient } from "@/lib/codex-task/adapters/codex-auto-client"
import { CodexSessionContractClient } from "@/lib/codex-task/adapters/codex-session-contract-client"
import { CodexTaskService, UnavailableCodexTaskClient } from "@/lib/codex-task/service"
import type { CodexTaskClient } from "@/lib/codex-task/types"

export function createCodexTaskClient(): CodexTaskClient {
  const provider = process.env.FESPA_DEEP_TASK_PROVIDER || "codex-app-server"
  if (provider === "codex-app-server") {
    return new CodexAppServerClient()
  }
  if (provider === "codex-auto") {
    return new CodexAutoClient()
  }
  if (provider === "codex-session") {
    return new CodexSessionContractClient()
  }
  if (provider === "codex-app-http") {
    return new CodexAppThreadClient()
  }
  return new UnavailableCodexTaskClient()
}

export function createCodexTaskService(client = createCodexTaskClient()) {
  return new CodexTaskService(client, {
    defaultUserId: process.env.FESPA_OPERATOR_ID || "single-operator",
  })
}
