#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "./lib/frontmatter.mjs";
import { resolveTechscopeRoot } from "./lib/paths.mjs";
import { now, today } from "./lib/date.mjs";

const ROOT = resolveTechscopeRoot();
const WIKI_DIR = path.join(ROOT, "10_wiki");
const PAGES_DIR = path.join(WIKI_DIR, "pages");
const INDEX_PATH = path.join(WIKI_DIR, "index.md");
const LOG_PATH = path.join(WIKI_DIR, "log.md");

const CURATED_PREFIXES = [
  "00_inbox/",
  "01_sources/notes/",
  "02_briefs/",
  "03_reviews/",
  "04_standards/",
  "05_decisions/",
  "07_workflows/",
];

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "into",
  "или",
  "как",
  "для",
  "что",
  "это",
  "при",
  "над",
  "без",
  "чем",
  "где",
  "она",
  "они",
]);

function sha(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function normalizeRel(value) {
  return value.split(path.sep).join("/");
}

function relPath(filePath) {
  return normalizeRel(path.relative(ROOT, filePath));
}

function asciiSlug(value) {
  const slug = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `item-${sha(value).slice(0, 10)}`;
}

function array(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function yamlValue(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `\n${value.map((item) => `  - ${item}`).join("\n")}`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    return `\n${entries
      .map(([key, inner]) => {
        const list = array(inner);
        if (list.length === 0) return `  ${key}: []`;
        return `  ${key}:\n${list.map((item) => `    - ${item}`).join("\n")}`;
      })
      .join("\n")}`;
  }
  return value === undefined || value === null ? "" : String(value);
}

function renderFrontmatter(data) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(data)) {
    const rendered = yamlValue(value);
    if (rendered.startsWith("\n")) {
      lines.push(`${key}:${rendered}`);
    } else {
      lines.push(`${key}: ${rendered}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

function extractTitle(body, fallback) {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

function extractSection(body, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const lines = body.split(/\r?\n/);
  let active = false;
  const out = [];
  for (const line of lines) {
    const match = line.match(/^##\s+(.+)$/);
    if (match) {
      active = wanted.has(match[1].trim().toLowerCase());
      continue;
    }
    if (active && /^##\s+/.test(line)) break;
    if (active) out.push(line);
  }
  return out.join("\n").trim();
}

function compact(text, limit = 700) {
  const normalized = String(text)
    .replace(/\s+/g, " ")
    .trim()
  if (normalized.length <= limit) return normalized;
  const clipped = normalized.slice(0, limit);
  const boundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, boundary > 100 ? boundary : limit).trim()}...`;
}

function tokenize(text) {
  return unique(
    String(text)
      .toLowerCase()
      .split(/[^a-z0-9а-яё-]+/iu)
      .map((item) => item.trim())
      .filter((item) => item.length >= 3 && !STOPWORDS.has(item)),
  );
}

function ensureWiki() {
  mkdirSync(PAGES_DIR, { recursive: true });
}

function assertCuratedArtifact(inputPath) {
  const fullPath = path.resolve(ROOT, inputPath);
  if (!fullPath.startsWith(ROOT + path.sep)) {
    throw new Error("Artifact path must be inside the Techscope workspace.");
  }
  if (!existsSync(fullPath) || !statSync(fullPath).isFile()) {
    throw new Error(`Artifact not found: ${inputPath}`);
  }
  if (!fullPath.endsWith(".md")) {
    throw new Error("Only Markdown artifacts can be ingested.");
  }
  const rel = relPath(fullPath);
  if (rel.startsWith("01_sources/raw/")) {
    throw new Error("Refusing to ingest raw artifacts. Create or use a curated intake, brief, assessment or review first.");
  }
  if (!CURATED_PREFIXES.some((prefix) => rel.startsWith(prefix))) {
    throw new Error(`Refusing to ingest non-curated artifact: ${rel}`);
  }
  return { fullPath, rel };
}

function artifactRelationKey(type) {
  const map = {
    intake: "intakes",
    brief: "briefs",
    assessment: "assessments",
    review: "reviews",
    decision: "decisions",
    standard: "standards",
    workflow: "workflows",
  };
  return map[type] || "sources";
}

function pageSpec(kind, name) {
  const cleanName = String(name).trim();
  return {
    kind,
    name: cleanName,
    id: `wiki-page-${kind}-${asciiSlug(cleanName)}`,
    fileName: `${kind}-${asciiSlug(cleanName)}.md`,
    title: `${kind}: ${cleanName}`,
  };
}

function selectPageSpecs(data, body) {
  const specs = [];
  for (const topic of array(data.topics)) specs.push(pageSpec("topic", topic));
  for (const tool of array(data.tools)) specs.push(pageSpec("tool", tool));

  const title = extractTitle(body, data.id || "artifact");
  for (const token of tokenize(title).slice(0, 3)) {
    if (!specs.some((spec) => spec.name.toLowerCase() === token.toLowerCase())) {
      specs.push(pageSpec("concept", token));
    }
  }

  return specs.slice(0, 16);
}

function sourceSignal(data, body, rel) {
  const summary = extractSection(body, ["Summary", "One-paragraph read", "Question"]);
  const claims = extractSection(body, ["Key claims", "Technical claims", "Recommendation"]);
  const title = extractTitle(body, data.id || rel);
  const signal = compact([summary, claims].filter(Boolean).join(" "), 900);
  return {
    title,
    signal: signal || compact(body, 900),
  };
}

function extractSignals(body) {
  return [...body.matchAll(/^- From `([^`]+)`: (.+)$/gm)].map((match) => ({
    source: match[1],
    signal: match[2],
  }));
}

function readMarkdown(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function renderWikiPage(spec, pageData, entries, relatedPages) {
  const relatedLinks = relatedPages
    .filter((page) => page.fileName !== spec.fileName)
    .slice(0, 12)
    .map((page) => `- [[pages/${page.fileName.replace(/\.md$/, "")}|${page.title}]]`)
    .join("\n");

  const signalLines = entries
    .map((entry) => `- From \`${entry.source}\`: ${entry.signal}`)
    .join("\n");

  const sourceLines = array(pageData.sources).map((source) => `- ${source}`).join("\n");

  return `${renderFrontmatter(pageData)}# Wiki Page: ${spec.title}

Status: generated
Review status: ${pageData.review_status}
Confidence: ${pageData.confidence}

## Generated summary

This generated page tracks ${spec.name} as a ${spec.kind} in the Techscope knowledge base. Use it for navigation and synthesis only; follow the sources before making standards or decisions.

## Current synthesis

${signalLines || "- No source signals yet."}

## Evidence sources

${sourceLines || "- Missing sources. Run lint."}

## Related pages

${relatedLinks || "- No related generated pages yet."}

## Open questions

- What curated artifact should promote or reject this generated synthesis?
`;
}

function upsertPage(spec, artifact, pageSpecs) {
  const pagePath = path.join(PAGES_DIR, spec.fileName);
  const existing = readMarkdown(pagePath);
  const parsed = parseFrontmatter(existing);
  const data = parsed.data.id
    ? parsed.data
    : {
        id: spec.id,
        type: "wiki-page",
        status: "generated",
        created: today(),
        updated: today(),
        topics: [],
        tools: [],
        sources: [],
        related: {},
        generated_from: [],
        review_status: "unreviewed",
        confidence: "low",
        last_linted: "",
      };

  const relationKey = artifactRelationKey(artifact.data.type);
  const topicValues = spec.kind === "topic" ? [spec.name] : array(data.topics);
  const toolValues = spec.kind === "tool" ? [spec.name] : array(data.tools);
  const related = data.related && typeof data.related === "object" && !Array.isArray(data.related) ? data.related : {};
  const entries = [];

  if (existing) {
    entries.push(...extractSignals(parsed.body));
  }

  const nextEntries = entries.filter((entry) => entry.source !== artifact.rel);
  nextEntries.push({ source: artifact.rel, signal: artifact.signal.signal });

  data.status = "generated";
  data.updated = today();
  data.topics = unique([...topicValues, ...array(artifact.data.topics)]);
  data.tools = unique([...toolValues, ...array(artifact.data.tools)]);
  data.sources = unique([...array(data.sources), artifact.rel, ...array(artifact.data.sources)]);
  related[relationKey] = unique([...array(related[relationKey]), artifact.rel]);
  related.wiki_pages = unique([
    ...array(related.wiki_pages),
    ...pageSpecs
      .filter((page) => page.fileName !== spec.fileName)
      .map((page) => `10_wiki/pages/${page.fileName}`),
  ]);
  data.related = related;
  data.generated_from = unique([...array(data.generated_from), artifact.rel]);
  data.review_status = data.review_status || "unreviewed";
  data.confidence = data.confidence || "low";
  data.last_linted = data.last_linted || "";

  writeFileSync(pagePath, renderWikiPage(spec, data, nextEntries, pageSpecs));
  return relPath(pagePath);
}

function listPageFiles() {
  if (!existsSync(PAGES_DIR)) return [];
  return readdirSync(PAGES_DIR)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => path.join(PAGES_DIR, entry))
    .sort();
}

function readPages() {
  return listPageFiles().map((filePath) => {
    const raw = readFileSync(filePath, "utf8");
    const { data, body } = parseFrontmatter(raw);
    return {
      filePath,
      rel: relPath(filePath),
      data,
      body,
      title: extractTitle(body, path.basename(filePath, ".md")),
    };
  });
}

function rebuildIndex() {
  ensureWiki();
  const pages = readPages();
  const related = pages.length ? { wiki_pages: pages.map((page) => page.rel) } : {};
  const sources = unique(["07_workflows/llm-wiki-layer.md", ...pages.flatMap((page) => array(page.data.sources))]);
  const bodyLines = pages.length
    ? pages.map((page) => {
        const name = page.rel.replace(/^10_wiki\//, "").replace(/\.md$/, "");
        const sourceCount = array(page.data.sources).length;
        const topics = array(page.data.topics).slice(0, 5).join(", ") || "no topics";
        return `- [[${name}|${page.title.replace(/^Wiki Page:\s*/, "")}]] — ${topics}; sources: ${sourceCount}; review: ${page.data.review_status || "unreviewed"}`;
      })
    : ["No generated wiki pages yet."];

  const data = {
    id: "llm-wiki-index",
    type: "wiki-index",
    status: "generated",
    created: "2026-05-15",
    updated: today(),
    topics: ["llm-wiki", "generated-knowledge", "index"],
    tools: ["markdown", "codex"],
    sources,
    related,
  };

  writeFileSync(
    INDEX_PATH,
    `${renderFrontmatter(data)}# LLM Wiki Index

Generated wiki index. Rebuild with:

\`\`\`sh
node scripts/llm-wiki.mjs ingest <artifact-path>
\`\`\`

## Pages

${bodyLines.join("\n")}
`,
  );
}

function appendLog(command, detail, pages = []) {
  ensureWiki();
  const lines = [
    "",
    `## [${now()}] ${command} | ${detail}`,
    "",
    ...pages.map((page) => `- ${page}`),
    "",
  ];
  appendFileSync(LOG_PATH, lines.join("\n"));
}

function commandIngest(inputPath) {
  ensureWiki();
  const artifactPath = assertCuratedArtifact(inputPath);
  const raw = readFileSync(artifactPath.fullPath, "utf8");
  const { data, body } = parseFrontmatter(raw);
  if (!data.id || !data.type) {
    throw new Error("Artifact must have YAML frontmatter with id and type.");
  }
  if (data.type === "template") {
    throw new Error("Templates cannot be ingested into the generated wiki layer.");
  }

  const specs = selectPageSpecs(data, body);
  if (specs.length === 0) {
    throw new Error("No topics, tools or title concepts found for wiki ingest.");
  }

  const artifact = {
    ...artifactPath,
    data,
    body,
    signal: sourceSignal(data, body, artifactPath.rel),
  };
  const changedPages = specs.map((spec) => upsertPage(spec, artifact, specs));
  rebuildIndex();
  appendLog("ingest", artifactPath.rel, changedPages);

  console.log(`Ingested: ${artifactPath.rel}`);
  console.log(`Updated ${changedPages.length} generated wiki page(s):`);
  for (const page of changedPages) console.log(`- ${page}`);
}

function scorePage(page, queryTokens) {
  const haystack = [
    page.title,
    page.rel,
    ...array(page.data.topics),
    ...array(page.data.tools),
    ...array(page.data.sources),
    page.body,
  ]
    .join(" ")
    .toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    const re = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
    const matches = haystack.match(re);
    score += matches ? matches.length : 0;
  }
  return score;
}

function commandQuery(question) {
  ensureWiki();
  if (!question) throw new Error("Missing query text.");
  const pages = readPages();
  const queryTokens = tokenize(question);
  const ranked = pages
    .map((page) => ({ ...page, score: scorePage(page, queryTokens) }))
    .filter((page) => page.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  appendLog("query", question, ranked.map((page) => page.rel));

  console.log(`Query: ${question}`);
  if (ranked.length === 0) {
    console.log("No matching generated wiki pages found. Use curated search or ingest relevant artifacts first.");
    return;
  }

  console.log("\nMatching generated pages:");
  for (const page of ranked) {
    console.log(`- ${page.rel} (score ${page.score})`);
    for (const source of array(page.data.sources).slice(0, 5)) {
      console.log(`  source: ${source}`);
    }
  }

  console.log("\nShort answer:");
  const synthesis = unique(
    ranked.flatMap((page) => extractSignals(page.body).map((entry) => compact(entry.signal, 260))),
  ).join(" ");
  console.log(synthesis || "The wiki has matching pages, but they need more source signals.");

  const weak = ranked.some((page) => array(page.data.sources).length === 0 || page.data.confidence === "low");
  if (weak) {
    console.log("\nEvidence note: at least one matching page has low confidence or missing sources. Open the cited curated artifacts before using this answer for standards or decisions.");
  }
}

function extractWikiLinks(text) {
  return [...text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)].map((match) => match[1].trim());
}

function resolveWikiLink(fromPath, target) {
  const candidates = [];
  if (target.endsWith(".md")) {
    candidates.push(path.join(WIKI_DIR, target));
  } else {
    candidates.push(path.join(WIKI_DIR, `${target}.md`));
    candidates.push(path.join(PAGES_DIR, `${target}.md`));
  }
  const fromDir = path.dirname(fromPath);
  candidates.push(path.join(fromDir, `${target}.md`));
  return candidates.some((candidate) => existsSync(candidate));
}

function commandLint() {
  ensureWiki();
  const pages = readPages();
  const issues = [];
  const wikiFiles = [INDEX_PATH, LOG_PATH, path.join(WIKI_DIR, "README.md"), ...listPageFiles()].filter(existsSync);
  const indexRaw = readMarkdown(INDEX_PATH);
  const logRaw = readMarkdown(LOG_PATH);

  for (const page of pages) {
    if (array(page.data.sources).length === 0) {
      issues.push(`${page.rel}: wiki page has no sources`);
    }
    if (page.data.status === "active") {
      issues.push(`${page.rel}: generated wiki page must not have active status`);
    }
    if (!indexRaw.includes(page.rel.replace(/^10_wiki\//, "").replace(/\.md$/, ""))) {
      issues.push(`${page.rel}: page is not linked from index.md`);
    }
    if (!logRaw.includes(page.rel)) {
      issues.push(`${page.rel}: page has no ingest log entry`);
    }
  }

  for (const filePath of wikiFiles) {
    const raw = readFileSync(filePath, "utf8");
    for (const link of extractWikiLinks(raw)) {
      if (!resolveWikiLink(filePath, link)) {
        issues.push(`${relPath(filePath)}: broken wiki link [[${link}]]`);
      }
    }
  }

  const linkedPages = extractWikiLinks(indexRaw).filter((link) => link.startsWith("pages/"));
  for (const link of linkedPages) {
    if (!existsSync(path.join(WIKI_DIR, `${link}.md`))) {
      issues.push(`10_wiki/index.md: index mentions missing page [[${link}]]`);
    }
  }

  appendLog("lint", issues.length === 0 ? "ok" : `${issues.length} issue(s)`, []);

  if (issues.length > 0) {
    console.log(`LLM wiki lint failed with ${issues.length} issue(s):`);
    for (const issue of issues) console.log(`- ${issue}`);
    process.exit(1);
  }

  console.log(`LLM wiki lint passed for ${pages.length} page(s).`);
}

function help() {
  console.log(`Usage:
  node scripts/llm-wiki.mjs ingest <artifact-path>
  node scripts/llm-wiki.mjs query "<question>"
  node scripts/llm-wiki.mjs lint`);
}

try {
  const command = process.argv[2] || "help";
  const arg = process.argv.slice(3).join(" ");
  if (command === "help") {
    help();
  } else if (command === "ingest") {
    commandIngest(arg);
  } else if (command === "query") {
    commandQuery(arg);
  } else if (command === "lint") {
    commandLint();
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
