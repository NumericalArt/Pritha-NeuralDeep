// Keep legacy scalar values byte-for-byte in semantic projections. New waivers
// use this same field with explicit actor, reason and operator Trial IDs.
export function automatedTrialWaiver(value) {
  if (value && typeof value === "object") return Array.isArray(value) ? [...value] : { ...value };
  return String(value || "none");
}

export function hasAutomatedTrialWaiver(value) {
  const waiver = automatedTrialWaiver(value);
  return typeof waiver !== "string" || !["none", "not-applicable", "n/a", ""].includes(waiver.trim().toLowerCase());
}

export function automatedTrialWaiverIssues(value, trials, { allowLegacy = false } = {}) {
  const waiver = automatedTrialWaiver(value);
  if (!hasAutomatedTrialWaiver(waiver)) return [];
  if (typeof waiver === "string") return allowLegacy ? [] : ["New automated_trial_waiver requires actor, reason and scope; existing approved scalar waivers remain legacy evidence"];
  const ids = trials.filter(trial => trial.kind === "operator-judged").map(trial => trial.id);
  if (Object.keys(waiver).sort().join(",") !== "actor,reason,scope" || waiver.actor !== "user"
    || typeof waiver.reason !== "string" || waiver.reason.trim().length < 12 || waiver.reason.length > 2000
    || !Array.isArray(waiver.scope) || !waiver.scope.length || waiver.scope.length > 64
    || new Set(waiver.scope).size !== waiver.scope.length || waiver.scope.some(id => !ids.includes(id))) {
    return ["automated_trial_waiver requires actor user, a concrete reason and a non-empty list of existing operator-judged Trial IDs"];
  }
  return [];
}
