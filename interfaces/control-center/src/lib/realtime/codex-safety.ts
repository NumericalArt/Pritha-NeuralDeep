function normalizeFlag(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/_/g, "-");
}

export function codexWriteFlagFromValues(primary: unknown, legacy: unknown) {
  const primaryValue = normalizeFlag(primary);
  if (primaryValue) return primaryValue;
  const legacyValue = normalizeFlag(legacy);
  if (legacyValue) return legacyValue;
  return "0";
}

export function codexWorkspaceWriteAllowedFromFlag(value: unknown) {
  return new Set(["1", "true", "yes", "enabled", "enable", "workspace-write", "write"]).has(normalizeFlag(value));
}

export function codexLegacyWriteEnabledFromFlag(value: unknown) {
  return new Set(["1", "true", "yes", "enabled", "enable", "workspace-write", "write"]).has(normalizeFlag(value));
}
