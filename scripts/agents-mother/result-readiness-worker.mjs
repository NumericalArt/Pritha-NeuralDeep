import path from "node:path";
import { readAgentResultReadiness } from "./result-readiness.mjs";

// Only the host supplies these paths. No Trial or agent command is executed.
let request = "";
try {
  for await (const chunk of process.stdin) {
    request += chunk.toString("utf8");
    if (Buffer.byteLength(request) > 32_000) throw new Error("request-too-large");
  }
  const input = JSON.parse(request);
  if (typeof input.target !== "string" || input.target.length > 256
    || [input.root, input.stateRoot, input.agentParent].some(value => typeof value !== "string" || !path.isAbsolute(value))) throw new Error("invalid-request");
  const view = readAgentResultReadiness(input.target, { root: input.root, stateRoot: input.stateRoot, agentParent: input.agentParent });
  process.stdout.write(JSON.stringify({ ...view, observedAt: new Date().toISOString() }));
} catch { process.exitCode = 1; }
