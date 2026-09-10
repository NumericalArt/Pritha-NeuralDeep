const none = value => /^(none|нет|без инструментов)$/i.test(String(value || "").trim());

// Missing legacy fields retain their previous modules. Explicit opt-outs win
// over keyword heuristics (for example "ephemeral; no SQLite" index notes).
export function selectedScaffoldModules(data, { toolProfiles, skills, telegram }) {
  const memory = !/^(none|ephemeral|ephemeral-only|нет|без памяти)$/i.test(String(data.memoryModel || "").trim());
  const selectedSkills = skills.policy.skillNeeds !== "none";
  const externalInput = /telegram|intake|uncurated|untrusted/i.test(String(data.inputDataTypes || ""));
  return Object.freeze({
    memory,
    tools: !none(data.toolSystem) && toolProfiles.length > 0,
    skills: selectedSkills,
    redaction: selectedSkills || Boolean(telegram) || externalInput || !none(data.untrustedInputPolicy),
  });
}
