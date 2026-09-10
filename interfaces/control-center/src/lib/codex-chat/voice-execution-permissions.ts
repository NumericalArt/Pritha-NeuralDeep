export type VoiceExecutionPermissions = { sandbox: "read-only" | "workspace-write" | "danger-full-access"; network: boolean };

/** A continuation can tighten its saved ceiling but cannot acquire broader Settings permissions. */
export function voiceExecutionPermissions(requested: VoiceExecutionPermissions, previous: unknown): VoiceExecutionPermissions {
  if (previous === null || previous === undefined) return requested;
  const saved = previous as Partial<VoiceExecutionPermissions>;
  const rank = {"read-only":0,"workspace-write":1,"danger-full-access":2};
  const ceiling = saved?.sandbox && saved.sandbox in rank ? saved.sandbox : "read-only";
  const sandbox = rank[ceiling] < rank[requested.sandbox] ? ceiling : requested.sandbox;
  const network = requested.network && saved?.network === true;
  if (sandbox === "danger-full-access" && !network) throw Object.assign(new Error("full_access_network_ceiling_conflict"),{code:"full_access_network_ceiling_conflict"});
  return {sandbox,network};
}
