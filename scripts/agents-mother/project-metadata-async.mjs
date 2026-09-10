import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAsyncProbe } from "../lib/async-probe.mjs";

export function unavailableProjectMetadata(reason = "project-metadata-unavailable") {
  const file = () => ({ status: "unavailable", text: "", mtime: null, mode: null });
  return { schema: "pritha-project-metadata-v1", manifest: { manifest: null, present: false, issue: reason }, envExample: file(), envLocal: file() };
}

// Even an ordinary open(2) may wait indefinitely on OS privacy or remote-file
// services. Keep all child-project content reads outside the HTTP event loop.
export async function readProjectMetadataAsync(projectPath, options = {}) {
  if (typeof projectPath !== "string" || !path.isAbsolute(projectPath) || projectPath.length > 4096) return unavailableProjectMetadata();
  const codeRoot = options.codeRoot || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const result = await runAsyncProbe(process.execPath, [path.join(codeRoot, "scripts/agents-mother/project-metadata-worker.mjs"), projectPath], {
    cwd: codeRoot, policy: "runtimeRead", timeout: options.timeoutMs,
  });
  if (result.error || result.status !== 0) return unavailableProjectMetadata(result.error?.code === "ETIMEDOUT" ? "project-metadata-timeout" : undefined);
  try {
    const data = JSON.parse(result.stdout);
    if (data.schema !== "pritha-project-metadata-v1" || !data.manifest || !data.envExample || !data.envLocal) throw new Error("invalid");
    return data;
  } catch { return unavailableProjectMetadata(); }
}
