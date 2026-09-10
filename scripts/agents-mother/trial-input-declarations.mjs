// Optional additions to Trial plan v1. Absent declarations preserve old locks.
export function trialInputDeclarations({ verifierInputs = [], productTargets = [] } = {}) {
  return {
    ...(verifierInputs.length ? { verifierInputs: verifierInputs.map(value => {
      const parts = String(value).split(" :: ");
      return { path: (parts[0] || "").trim(), hash: (parts[1] || "").trim(), provenance: parts.slice(2).join(" :: ").trim() };
    }) } : {}),
    ...(productTargets.length ? { productTargets } : {}),
  };
}

export function safeTrialInputPath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 1024
    && !value.startsWith("-") && !/[\\\x00-\x1f:]/.test(value)
    && value.split("/").every(part => part && part !== "." && part !== "..");
}

export function trialInputDeclarationIssues(trial) {
  const issues = [], verifiers = trial.verifierInputs ?? [], products = trial.productTargets ?? [];
  if (!Array.isArray(verifiers) || !Array.isArray(products) || verifiers.length > 64 || products.length > 64) return ["Trial input declarations must be bounded arrays"];
  if ((verifiers.length || products.length) && trial.kind !== "automated") issues.push("Trial input declarations require an automated Trial");
  for (const item of verifiers) {
    if (!item || Object.keys(item).sort().join(",") !== "hash,path,provenance"
      || !safeTrialInputPath(item.path) || !/^sha256:[a-f0-9]{64}$/.test(item.hash || "")
      || typeof item.provenance !== "string" || item.provenance.length > 512
      || !/^(host-reviewed|host-template):[a-z0-9][a-z0-9._/@ -]{2,}$/i.test(item.provenance)) {
      issues.push("Verifier input requires a project-relative path, exact SHA-256 and host-reviewed or host-template provenance");
    }
  }
  if (products.some(value => !safeTrialInputPath(value))) issues.push("Product targets must use project-relative paths");
  if (new Set(products).size !== products.length || new Set(verifiers.map(item => item?.path)).size !== verifiers.length) issues.push("Trial input declarations may not repeat paths");
  const overlaps = (left, right) => typeof left === "string" && typeof right === "string"
    && (left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`));
  if (products.some(product => verifiers.some(item => item?.path && overlaps(product, item.path)) || (trial.fixture && overlaps(product, trial.fixture)))) issues.push("Product targets and protected verification inputs must be separate");
  if (products.length && !verifiers.length && ![
    trial.thenStdoutContains, trial.thenStdoutExcludes, trial.thenStderrContains, trial.thenStderrExcludes,
    trial.thenArtifacts, trial.thenArtifactContains, trial.thenAbsentPaths,
  ].some(values => Array.isArray(values) && values.length)) issues.push("A mutable product target needs an independent verifier or observable result assertions");
  return issues;
}
