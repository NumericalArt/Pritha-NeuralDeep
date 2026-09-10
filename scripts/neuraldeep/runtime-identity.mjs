import { createHash } from "node:crypto";
import path from "node:path";

export function neuralDeepRuntimeIdentity(stateRoot, environment = process.env) {
  const home = path.resolve(environment.PRITHA_NEURALDEEP_CODEX_HOME || path.join(path.resolve(stateRoot), "codex-home"));
  const origin = new URL(environment.PRITHA_NEURALDEEP_UPSTREAM_ORIGIN || "https://api.neuraldeep.ru").origin;
  return {
    home,
    // Preserve the existing home identity; provider provenance is additional.
    stateIdentityHash: createHash("sha256").update(home).digest("hex").slice(0, 24),
    profileIdentity: createHash("sha256").update(JSON.stringify([home, origin])).digest("hex"),
  };
}

export function neuralDeepSessionKey(stateRoot, session, environment = process.env) {
  const identity = neuralDeepRuntimeIdentity(stateRoot, environment);
  const origin = new URL(environment.PRITHA_NEURALDEEP_UPSTREAM_ORIGIN || "https://api.neuraldeep.ru").origin;
  return createHash("sha256").update(JSON.stringify([identity.home, origin, session])).digest("hex").slice(0, 24);
}
