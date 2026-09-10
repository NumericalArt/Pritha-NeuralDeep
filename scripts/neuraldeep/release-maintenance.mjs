import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const location = stateRoot => path.join(stateRoot, "setup", "neuraldeep-release-lock.json");
export function assertNeuralDeepDispatchAllowed(stateRoot) {
  if (existsSync(location(stateRoot))) throw Object.assign(new Error("NeuralDeep is undergoing a managed release. The saved request can continue after maintenance."), { code: "neuraldeep_release_maintenance" });
}
export function acquireNeuralDeepReleaseLock(stateRoot, owner) {
  if (!/^[a-f0-9-]{36}$/.test(owner)) throw new Error("Invalid maintenance owner");
  const file = location(stateRoot); mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ schema: "neuraldeep-release-lock-v1", owner, createdAt: new Date().toISOString() }), { flag: "wx", mode: 0o600 });
}
export function releaseNeuralDeepReleaseLock(stateRoot, owner) {
  const file = location(stateRoot), lock = JSON.parse(readFileSync(file, "utf8"));
  if (lock.schema !== "neuraldeep-release-lock-v1" || lock.owner !== owner) throw new Error("Maintenance owner mismatch; lock retained");
  unlinkSync(file);
}
