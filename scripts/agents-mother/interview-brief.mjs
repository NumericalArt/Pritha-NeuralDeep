import { slug } from "../lib/slug.mjs";

export const INTERVIEW_BRIEF_SCHEMA_VERSION = 1;
export const INTERVIEW_PRESETS = new Set(["generic", "local-feed", "llm-app"]);
const technicalKeys = ["preset", "sourceFormat", "runtimeFamily", "serviceMode", "primaryInterface", "runtimePlacementProfile", "repositoryResearchPolicy", "repositoryAdoptionMode", "repositoryResearchWaiverReason", "repositoryResearchTopics", "targetFolder"];
const designKeys = ["memoryModel", "storedData", "inputDataTypes", "sensitiveData", "riskNotes"];
const clean = (value) => typeof value === "string" ? value.trim().replace(/\r\n?/g, "\n") : "";
const items = (value) => Array.isArray(value) ? value.map(clean).filter(Boolean) : clean(value).split(/\n|;/).map((item) => item.replace(/^\s*(?:[-*]|\d+\.)\s+/, "").trim()).filter(Boolean);

/** The product brief is data, never an authorization event. */
export function normalizeInterviewBrief(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Interview brief must be an object");
  if (value.schemaVersion !== undefined && value.schemaVersion !== INTERVIEW_BRIEF_SCHEMA_VERSION) throw new Error("Unsupported interview brief schemaVersion");
  for (const key of ["identity", "permissions", "technical", "design"]) {
    if (value[key] !== undefined && (!value[key] || typeof value[key] !== "object" || Array.isArray(value[key]))) throw new Error(`Interview brief ${key} must be an object`);
  }
  for (const key of ["goal", "user"]) {
    if (value[key] !== undefined && typeof value[key] !== "string") throw new Error(`Interview brief ${key} must be text`);
  }
  for (const key of ["successCriteria", "coreFunctions", "workflows", "sources", "constraints", "nonGoals"]) {
    if (value[key] !== undefined && typeof value[key] !== "string" && (!Array.isArray(value[key]) || value[key].some((item) => typeof item !== "string"))) throw new Error(`Interview brief ${key} must contain text`);
  }
  for (const key of ["name", "slug"]) {
    if (value.identity?.[key] !== undefined && typeof value.identity[key] !== "string") throw new Error(`Interview brief identity.${key} must be text`);
  }
  for (const key of ["network", "filesystem"]) {
    const permission = value.permissions?.[key];
    if (permission !== undefined && typeof permission !== "string" && (!Array.isArray(permission) || permission.some((item) => typeof item !== "string"))) throw new Error(`Interview brief permissions.${key} must contain text`);
  }
  if (value.permissions?.authorization !== undefined && typeof value.permissions.authorization !== "string") throw new Error("Interview brief authorization must be text");
  const name = clean(value.identity?.name);
  const identity = { name, slug: clean(value.identity?.slug) || (name ? slug(name) : "") };
  const technical = Object.fromEntries(technicalKeys.filter((key) => value.technical?.[key] !== undefined).map((key) => {
    if (typeof value.technical[key] !== "string") throw new Error(`Interview brief technical.${key} must be text`);
    return [key, clean(value.technical[key])];
  }));
  const design = Object.fromEntries(designKeys.filter((key) => value.design?.[key] !== undefined).map((key) => {
    if (typeof value.design[key] !== "string") throw new Error(`Interview brief design.${key} must be text`);
    return [key, clean(value.design[key])];
  }));
  return {
    schemaVersion: INTERVIEW_BRIEF_SCHEMA_VERSION,
    identity, goal: clean(value.goal), user: clean(value.user),
    successCriteria: items(value.successCriteria), coreFunctions: items(value.coreFunctions),
    workflows: items(value.workflows), sources: items(value.sources), constraints: items(value.constraints), nonGoals: items(value.nonGoals),
    permissions: { network: items(value.permissions?.network), filesystem: items(value.permissions?.filesystem), authorization: clean(value.permissions?.authorization) },
    technical, design,
  };
}

export function validateInterviewBrief(value, { requireComplete = false } = {}) {
  let brief;
  try { brief = normalizeInterviewBrief(value); } catch (error) { return [error.message]; }
  const issues = [];
  if (brief.identity.slug && !/^[a-z0-9][a-z0-9-]{0,95}$/.test(brief.identity.slug)) issues.push("Interview brief slug must be a bounded lowercase slug");
  if (brief.technical.preset && !INTERVIEW_PRESETS.has(brief.technical.preset)) issues.push("Interview brief preset must be generic, local-feed, or llm-app");
  if (brief.technical.sourceFormat && !["json", "rss", "atom", "mixed"].includes(brief.technical.sourceFormat)) issues.push("Interview brief sourceFormat must be json, rss, atom, or mixed");
  if (requireComplete) {
    for (const [key, present] of [["name", brief.identity.name], ["goal", brief.goal], ["user", brief.user], ["successCriteria", brief.successCriteria.length]]) {
      if (!present) issues.push(`Interview brief requires ${key}`);
    }
  }
  if (JSON.stringify(brief).length > 128_000) issues.push("Interview brief exceeds 128000 characters");
  return issues;
}

const label = (value) => value.toLowerCase().replace(/[`*_]/g, "").replace(/\s*\([^)]*\)/g, "").replace(/[^\p{L}0-9]+/gu, "");
const aliases = {
  name: ["name", "agent name", "название", "имя", "name / slug"],
  slug: ["slug", "technical slug", "слаг"],
  goal: ["mission", "primary mission", "goal", "миссия", "цель"],
  user: ["target user", "user", "audience", "пользователь", "целевая аудитория"],
  successCriteria: ["success criterion", "success criteria", "acceptance criteria", "критерий успеха", "критерии успеха", "критерии готовности"],
  coreFunctions: ["core functions", "v1 core functions", "features", "функции", "функции v1"],
  workflows: ["workflows", "critical user workflows", "user journey", "сценарии", "пользовательский сценарий"],
  sources: ["sources", "data sources", "источники"],
  constraints: ["constraints", "constraints and limits", "ограничения"],
  nonGoals: ["non-goals", "out of scope", "excluded", "не входит в v1", "явно не выбрано"],
  network: ["allowed network access", "network", "сеть", "сетевой доступ"],
  filesystem: ["allowed filesystem access", "filesystem", "файловый доступ"],
  authorization: ["user authorization model", "authorization", "права", "разрешения"],
};
for (const key of technicalKeys) aliases[key] = [key, key.replace(/([A-Z])/g, " $1")];
for (const key of designKeys) aliases[key] = [key, key.replace(/([A-Z])/g, " $1")];
aliases.preset.push("шаблон");
const aliasMap = new Map(Object.entries(aliases).flatMap(([key, values]) => values.map((value) => [label(value), key])));
const unquote = (text) => text.trim().replace(/^`([^`]+)`(?:\s*\([^)]*\))?$/, "$1");

export function parseInterviewBrief(text) {
  const source = String(text || "").replace(/\r\n?/g, "\n");
  if (source.length > 128_000) throw new Error("Interview brief exceeds 128000 characters");
  const fenced = source.match(/```pritha-brief-json\s*\n([\s\S]*?)\n```/);
  if (fenced || source.trimStart().startsWith("{")) {
    const brief = normalizeInterviewBrief(JSON.parse(fenced ? fenced[1] : source));
    const issues = validateInterviewBrief(brief);
    if (issues.length) throw new Error(issues.join("; "));
    return brief;
  }
  const values = {};
  const body = source.replace(/^---\n[\s\S]*?\n---(?:\n|$)/, "");
  const lines = body.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
    if (heading) {
      const key = aliasMap.get(label(heading[1]));
      if (key) {
        let end = index + 1;
        while (end < lines.length && !/^#{1,6}\s/.test(lines[end])) end += 1;
        values[key] = lines.slice(index + 1, end).join("\n").trim();
      }
    }
    const table = line.match(/^\s*\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|\s*$/);
    const field = line.match(/^\s*(?:[-*]\s+)?([^:：]+?)[:：]\s*(.+)$/);
    const match = table || field;
    if (match) {
      const key = aliasMap.get(label(match[1]));
      if (key) values[key] = unquote(match[2]);
    }
    // Older briefs put multiple explicit technical fields in a single bullet.
    for (const key of technicalKeys) {
      const match = line.match(new RegExp("\\b" + key + "\\s*[:：]\\s*`?([a-zA-Z0-9][a-zA-Z0-9 _-]*)(?:`|$|,)", "i"));
      if (match) values[key] = match[1].trim();
    }
    if (/GitHub research/i.test(line)) {
      values.repositoryResearchPolicy ||= line.match(/\bpolicy\s+`?([a-z-]+)/i)?.[1];
      values.repositoryAdoptionMode ||= line.match(/\badoption(?: mode)?\s+`?([a-z-]+)/i)?.[1];
    }
  }
  if (values.name?.includes(" / ")) {
    const [name, technicalSlug] = values.name.split(" / ");
    values.name = name.trim(); values.slug ||= unquote(technicalSlug);
  }
  const brief = normalizeInterviewBrief({
    identity: { name: values.name, slug: values.slug }, goal: values.goal, user: values.user,
    ...Object.fromEntries(["successCriteria", "coreFunctions", "workflows", "sources", "constraints", "nonGoals"].map((key) => [key, values[key]])),
    permissions: { network: values.network, filesystem: values.filesystem, authorization: values.authorization },
    technical: Object.fromEntries(technicalKeys.filter((key) => values[key]).map((key) => [key, values[key]])),
    design: Object.fromEntries(designKeys.filter((key) => values[key]).map((key) => [key, values[key]])),
  });
  const issues = validateInterviewBrief(brief);
  if (issues.length) throw new Error(issues.join("; "));
  return brief;
}

export function serializeInterviewBrief(value) {
  const brief = normalizeInterviewBrief(value);
  const issues = validateInterviewBrief(brief);
  if (issues.length) throw new Error(issues.join("; "));
  return `${JSON.stringify(brief, null, 2)}\n`;
}

export function interviewBriefOptions(value) {
  const brief = normalizeInterviewBrief(value);
  const map = {
    name: brief.identity.name, slug: brief.identity.slug, mission: brief.goal, user: brief.user,
    success: brief.successCriteria.join("; "), core: brief.coreFunctions.join("; "), workflows: brief.workflows.join("; "),
    sources: brief.sources.join("; "), constraints: brief.constraints.join("; "), "out-of-scope": brief.nonGoals.join("; "),
    "allowed-network": brief.permissions.network.join("; "), "allowed-filesystem": brief.permissions.filesystem.join("; "), "authorization": brief.permissions.authorization,
    preset: brief.technical.preset, "source-format": brief.technical.sourceFormat, runtime: brief.technical.runtimeFamily,
    service: brief.technical.serviceMode, interface: brief.technical.primaryInterface, "runtime-placement": brief.technical.runtimePlacementProfile,
    "repository-policy": brief.technical.repositoryResearchPolicy, "repository-adoption": brief.technical.repositoryAdoptionMode,
    "repository-waiver": brief.technical.repositoryResearchWaiverReason, "repository-topics": brief.technical.repositoryResearchTopics,
    "target-folder": brief.technical.targetFolder,
    memory: brief.design.memoryModel, stored: brief.design.storedData, inputs: brief.design.inputDataTypes,
    sensitive: brief.design.sensitiveData, risks: brief.design.riskNotes,
  };
  return Object.fromEntries(Object.entries(map).filter(([, value]) => Boolean(value)));
}
