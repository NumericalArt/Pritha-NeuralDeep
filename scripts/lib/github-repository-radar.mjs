import { createHash } from "node:crypto";
import path from "node:path";
import { readBoundedRegularFile } from "./safe-file-read.mjs";

const GITHUB_REPOSITORY_REGISTRY_RELATIVE_PATH = path.join(
  "01_sources",
  "registries",
  "github-agent-building-repos.md",
);

const GITHUB_REPOSITORY_TOPIC_QUERIES = Object.freeze({
  "agent-harness": [
    "agent framework harness tool calling stars:>25",
    "AI agent framework TypeScript MCP stars:>25",
    "LLM agent memory tools workflow stars:>25",
  ],
  "agent-memory": [
    "AI agent memory vector database workflow stars:>25",
    "LLM memory retrieval agent stars:>25",
  ],
  "agent-evals": [
    "LLM agent evals benchmark harness stars:>25",
    "AI agent evaluation framework tool use stars:>25",
  ],
  "mcp-tools": [
    "MCP server tools agent framework stars:>25",
    "model context protocol agent tools stars:>25",
  ],
  "agent-skills": [
    "AI agent skills workflow library stars:>25",
    "agent skill pack prompt workflow stars:>25",
  ],
  "agent-interface": [
    "AI agent interface control center web UI stars:>25",
    "agent chat interface operator console stars:>25",
  ],
  "agent-voice": [
    "voice AI agent realtime speech MCP stars:>25",
    "local voice agent speech interface stars:>25",
  ],
  "agent-operations": [
    "AI agent runtime operations gateway scheduler stars:>25",
    "agent deployment observability sandbox stars:>25",
  ],
});

export function normalizeGitHubRepositoryUrl(value) {
  let source = String(value || "").trim();
  const markdownLink = source.match(/^\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+["'][^"']*["'])?\s*\)$/);
  if (markdownLink) source = markdownLink[1];
  source = source.replace(/^`+|`+$/g, "").replace(/^<|>$/g, "").trim();
  let repositoryPath = "";
  for (const prefix of ["https://github.com/", "ssh://git@github.com/", "git@github.com:"]) {
    if (source.toLowerCase().startsWith(prefix)) {
      repositoryPath = source.slice(prefix.length);
      break;
    }
  }
  if (!repositoryPath || /[%?#\\\u0000-\u001f\u007f]/.test(repositoryPath)) return null;
  repositoryPath = repositoryPath.replace(/\/$/, "").replace(/\.git$/i, "");
  const parts = repositoryPath.split("/");
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) return null;
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(repo) || repo === "." || repo === "..") return null;
  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    url: `https://github.com/${owner}/${repo}`,
  };
}

function splitMarkdownTableRow(line) {
  const source = String(line || "").trim();
  if (!source.startsWith("|") || !source.endsWith("|")) return [];

  const cells = [];
  let current = "";
  const body = source.slice(1, -1);
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === "\\" && body[index + 1] === "|") {
      current += "|";
      index += 1;
    } else if (char === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseIntegerCell(value) {
  const normalized = String(value || "").replace(/[,\s_]/g, "");
  return Number.parseInt(normalized, 10) || 0;
}

function parseGitHubRepositoryRegistry(markdown) {
  return String(markdown || "")
    .split(/\r?\n/)
    .map((line) => {
      const cells = splitMarkdownTableRow(line);
      if (cells.length < 8) return null;
      const repository = normalizeGitHubRepositoryUrl(cells[0]);
      if (!repository) return null;
      const hasLicenseColumn = cells.length >= 9;
      const notes = cells[hasLicenseColumn ? 8 : 7] || "";
      const inferredLicense = notes.match(/\b(AGPL-\d+(?:\.\d+)?|GPL-\d+(?:\.\d+)?|LGPL-\d+(?:\.\d+)?|Apache-\d+(?:\.\d+)?|MIT|BSD-\d-Clause|MPL-\d+(?:\.\d+)?)\b/i)?.[1] || "unknown";
      return {
        repo: repository.url,
        repository,
        topics: cells[1] || "",
        topicList: String(cells[1] || "")
          .split(/[;,]/)
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean),
        status: String(cells[2] || "").trim().toLowerCase().replace(/_/g, "-"),
        added: cells[3] || "",
        lastChecked: cells[4] || "",
        stars: parseIntegerCell(cells[5]),
        license: hasLicenseColumn ? (cells[6] || "unknown") : inferredLicense,
        why: cells[hasLicenseColumn ? 7 : 6] || "",
        notes,
      };
    })
    .filter(Boolean);
}

export function readGitHubRepositoryRegistry(root, options = {}) {
  const requestedRelativePath = String(options.relativePath || GITHUB_REPOSITORY_REGISTRY_RELATIVE_PATH)
    .trim()
    .replaceAll("\\", "/");
  const segments = requestedRelativePath.split("/");
  const safeRelativePath = Boolean(
    requestedRelativePath
    && !path.posix.isAbsolute(requestedRelativePath)
    && segments.every((segment) => segment && segment !== "." && segment !== ".." && !segment.includes("\0")),
  );
  if (!safeRelativePath) {
    return {
      ok: false,
      relativePath: "",
      fullPath: "",
      rows: [],
      error: "registry path must be a safe project-relative path",
    };
  }
  const projectRoot = path.resolve(root);
  const relativePath = segments.join(path.sep);
  const fullPath = path.resolve(projectRoot, relativePath);
  try {
    const markdown = readBoundedRegularFile(fullPath, {
      maxBytes: 1_000_000,
      allowedRoots: [projectRoot],
    }).text;
    return {
      ok: true,
      relativePath: path.relative(projectRoot, fullPath),
      fullPath,
      rows: parseGitHubRepositoryRegistry(markdown),
      error: "",
    };
  } catch (error) {
    return {
      ok: false,
      relativePath: path.relative(projectRoot, fullPath),
      fullPath,
      rows: [],
      error: error instanceof Error ? error.message : "registry read failed",
    };
  }
}

export function plannedGitHubRepositoryQueries(topic) {
  const normalized = String(topic || "agent-harness").trim() || "agent-harness";
  const queries = GITHUB_REPOSITORY_TOPIC_QUERIES[normalized];
  if (!queries) return [];
  return queries.map((query) => /(?:^|\s)is:public(?:\s|$)/i.test(query) ? query : `${query} is:public`);
}

export function isAllowedGitHubRepositoryTopic(topic) {
  return Object.hasOwn(GITHUB_REPOSITORY_TOPIC_QUERIES, String(topic || "").trim());
}

export function normalizeRepositoryModulePath(value) {
  const modulePath = String(value || "").trim();
  if (!modulePath || modulePath.length > 400) return null;
  if (/[%?#\\\u0000-\u001f\u007f\s]/.test(modulePath)) return null;
  if (modulePath.startsWith("/") || modulePath.endsWith("/") || modulePath.includes("//")) return null;
  const segments = modulePath.split("/");
  if (!segments.length || segments.length > 20) return null;
  if (segments.some((segment) => segment === "." || segment === ".." || segment.length > 100 || !/^[A-Za-z0-9._@+-]+$/.test(segment))) {
    return null;
  }
  return modulePath;
}

export function githubRepositoryContentUrlMatches(value, repositoryValue, kindValue, pinValue, relativePathValue, options = {}) {
  const repository = normalizeGitHubRepositoryUrl(repositoryValue);
  const relativePath = normalizeRepositoryModulePath(relativePathValue);
  const kind = String(kindValue || "");
  const pin = String(pinValue || "").replace(/^(?:commit|tree-sha):/i, "").toLowerCase();
  if (!repository || !relativePath || !["blob", "tree"].includes(kind) || !/^[a-f0-9]{40}$/.test(pin)) return false;
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" || url.username || url.password || url.search || url.hash) return false;
    const parts = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
    if (parts.length < 5
      || parts[0].toLowerCase() !== repository.owner.toLowerCase()
      || parts[1].toLowerCase() !== repository.repo.toLowerCase()
      || parts[2] !== kind
      || parts[3].toLowerCase() !== pin) return false;
    const actualPath = parts.slice(4).join("/");
    return actualPath === relativePath || (options.allowDescendant === true && actualPath.startsWith(`${relativePath}/`));
  } catch {
    return false;
  }
}

export function normalizeGitHubApiRepository(item) {
  if (item?.private === true) return null;
  if (item?.visibility && String(item.visibility).toLowerCase() !== "public") return null;
  const repository = normalizeGitHubRepositoryUrl(item?.html_url || item?.url || "");
  if (!repository) return null;
  return {
    repo: repository,
    description: String(item?.description || ""),
    stars: Number(item?.stargazers_count || item?.stars || 0),
    language: String(item?.language || ""),
    updatedAt: String(item?.updated_at || item?.updatedAt || ""),
    pushedAt: String(item?.pushed_at || item?.pushedAt || ""),
    defaultBranch: String(item?.default_branch || item?.defaultBranch || ""),
    license: String(item?.license?.spdx_id || item?.license?.name || item?.license || ""),
    archived: Boolean(item?.archived),
    fork: Boolean(item?.fork),
    topics: Array.isArray(item?.topics) ? item.topics.map(String) : [],
    headSha: String(item?.head_sha || item?.headSha || ""),
    verifiedPinSha: String(item?.verified_pin_sha || item?.verifiedPinSha || ""),
    verifiedModulePath: String(item?.verified_module_path || item?.verifiedModulePath || ""),
    verifiedModuleSha: String(item?.verified_module_sha || item?.verifiedModuleSha || ""),
    verifiedModuleType: String(item?.verified_module_type || item?.verifiedModuleType || ""),
    verificationSourceUrl: String(item?.verification_source_url || item?.verificationSourceUrl || ""),
    verifiedLicensePath: String(item?.verified_license_path || item?.verifiedLicensePath || ""),
    verifiedLicenseBlobSha: String(item?.verified_license_blob_sha || item?.verifiedLicenseBlobSha || ""),
    verifiedLicenseContentSha256: String(item?.verified_license_content_sha256 || item?.verifiedLicenseContentSha256 || ""),
    verifiedLicenseSpdx: String(item?.verified_license_spdx || item?.verifiedLicenseSpdx || ""),
    verifiedLicenseSourceUrl: String(item?.verified_license_source_url || item?.verifiedLicenseSourceUrl || ""),
    verifiedLicenseScope: String(item?.verified_license_scope || item?.verifiedLicenseScope || ""),
    latestReleaseTag: String(item?.latest_release_tag || item?.latestReleaseTag || ""),
    retrievedAt: String(item?.retrieved_at || item?.retrievedAt || new Date().toISOString()),
  };
}

function isExplicitlyPublicGitHubApiRepository(item) {
  return item?.private === false && String(item?.visibility || "").toLowerCase() === "public";
}

function githubHeaders(options = {}) {
  const token = String(options.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "pritha-github-knowledge-radar",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchJson(url, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("Global fetch is unavailable.");
  const remainingMs = options.deadline ? Number(options.deadline) - Date.now() : 60_000;
  if (!Number.isFinite(remainingMs) || remainingMs < 250) throw new Error("GitHub research total timeout exceeded");
  const timeoutMs = Math.max(250, Math.min(Number(options.timeoutMs || 15_000) || 15_000, remainingMs, 60_000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: githubHeaders(options),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`GitHub request failed: ${response.status} ${response.statusText}`);
    }
    const maxResponseBytes = Math.max(1_024, Math.min(Number(options.maxResponseBytes || 2_000_000) || 2_000_000, 5_000_000));
    const contentLength = Number(response.headers?.get?.("content-length") || 0);
    if (contentLength > maxResponseBytes) throw new Error(`GitHub response exceeds ${maxResponseBytes} byte limit`);
    if (response.body && typeof response.body.getReader === "function") {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let body = "";
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || []);
          bytes += chunk.byteLength;
          if (bytes > maxResponseBytes) {
            await Promise.resolve(reader.cancel("response-size-limit")).catch(() => {});
            controller.abort();
            throw new Error(`GitHub response exceeds ${maxResponseBytes} byte limit`);
          }
          body += decoder.decode(chunk, { stream: true });
        }
        body += decoder.decode();
      } finally {
        reader.releaseLock?.();
      }
      return JSON.parse(body);
    }
    if (typeof response.text === "function") {
      const body = await response.text();
      if (Buffer.byteLength(body, "utf8") > maxResponseBytes) throw new Error(`GitHub response exceeds ${maxResponseBytes} byte limit`);
      return JSON.parse(body);
    }
    const payload = await response.json();
    if (Buffer.byteLength(JSON.stringify(payload), "utf8") > maxResponseBytes) {
      throw new Error(`GitHub response exceeds ${maxResponseBytes} byte limit`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchGitHubRepositorySearch(query, limit, options = {}) {
  const normalizedQuery = String(query || "").trim();
  if (!/(?:^|\s)is:public(?:\s|$)/i.test(normalizedQuery)) {
    throw new Error("GitHub repository discovery query must include is:public");
  }
  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(Math.min(Math.max(Number(limit) || 1, 1), 25)));
  return fetchJson(url, options);
}

async function fetchGitHubRepository(repositoryValue, options = {}) {
  const repository = normalizeGitHubRepositoryUrl(repositoryValue);
  if (!repository) throw new Error(`Invalid GitHub repository: ${repositoryValue}`);
  const url = new URL(`https://api.github.com/repos/${repository.owner}/${repository.repo}`);
  const payload = await fetchJson(url, options);
  if (!isExplicitlyPublicGitHubApiRepository(payload)) {
    throw new Error("GitHub repository is private, internal or lacks explicit public visibility");
  }
  return normalizeGitHubApiRepository(payload);
}

async function fetchGitHubRepositoryHead(repositoryValue, branch, options = {}) {
  const repository = normalizeGitHubRepositoryUrl(repositoryValue);
  if (!repository) throw new Error(`Invalid GitHub repository: ${repositoryValue}`);
  const ref = String(branch || "HEAD").trim() || "HEAD";
  const url = new URL(`https://api.github.com/repos/${repository.owner}/${repository.repo}/commits/${encodeURIComponent(ref)}`);
  const payload = await fetchJson(url, options);
  return {
    sha: String(payload?.sha || ""),
    treeSha: String(payload?.commit?.tree?.sha || ""),
    url: String(payload?.html_url || ""),
    committedAt: String(payload?.commit?.committer?.date || payload?.commit?.author?.date || ""),
  };
}

async function fetchGitHubRepositoryTree(repositoryValue, treeSha, options = {}) {
  const repository = normalizeGitHubRepositoryUrl(repositoryValue);
  if (!repository) throw new Error(`Invalid GitHub repository: ${repositoryValue}`);
  const sha = String(treeSha || "").trim();
  if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error("Invalid GitHub tree SHA");
  const url = new URL(`https://api.github.com/repos/${repository.owner}/${repository.repo}/git/trees/${sha}`);
  const payload = await fetchJson(url, options);
  return {
    sha: String(payload?.sha || ""),
    entries: Array.isArray(payload?.tree)
      ? payload.tree.map((entry) => ({
        path: String(entry?.path || ""),
        mode: String(entry?.mode || ""),
        type: String(entry?.type || ""),
        sha: String(entry?.sha || ""),
      }))
      : [],
    truncated: Boolean(payload?.truncated),
  };
}

export async function fetchGitHubRepositoryModuleAtTree(repositoryValue, moduleValue, rootTreeSha, options = {}) {
  const repository = normalizeGitHubRepositoryUrl(repositoryValue);
  if (!repository) throw new Error(`Invalid GitHub repository: ${repositoryValue}`);
  const modulePath = normalizeRepositoryModulePath(moduleValue);
  if (!modulePath) throw new Error("Selected repository module must be a safe repository-relative path");
  let treeSha = String(rootTreeSha || "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(treeSha)) throw new Error("Selected repository root tree SHA is invalid");
  const segments = modulePath.split("/");
  let entry = null;
  for (let index = 0; index < segments.length; index += 1) {
    const tree = await fetchGitHubRepositoryTree(repository.url, treeSha, options);
    if (String(tree.sha || "").toLowerCase() !== treeSha) throw new Error("GitHub tree response SHA mismatch");
    if (tree.truncated) throw new Error("GitHub tree response is truncated");
    entry = tree.entries.find((item) => item.path === segments[index]) || null;
    if (!entry || !/^[a-f0-9]{40}$/i.test(entry.sha)) {
      throw new Error(`Selected repository module path does not exist at pin: ${modulePath}`);
    }
    if (index < segments.length - 1 && entry.type !== "tree") {
      throw new Error(`Selected repository module path crosses a non-directory entry: ${modulePath}`);
    }
    treeSha = entry.sha.toLowerCase();
  }
  if (!entry || !["tree", "blob"].includes(entry.type)) {
    throw new Error(`Selected repository module is a gitlink or unsupported entry type: ${modulePath}`);
  }
  if (entry.type === "tree" && entry.mode !== "040000") {
    throw new Error(`Selected repository module directory mode is invalid: ${modulePath}`);
  }
  if (entry.type === "blob" && !["100644", "100755"].includes(entry.mode)) {
    throw new Error(`Selected repository module is a symlink or unsupported blob mode: ${modulePath}`);
  }
  const kind = entry?.type === "blob" ? "blob" : "tree";
  const pinSha = String(options.pinSha || rootTreeSha).toLowerCase();
  return {
    path: modulePath,
    sha: String(entry?.sha || "").toLowerCase(),
    type: String(entry?.type || ""),
    sourceUrl: `https://github.com/${repository.owner}/${repository.repo}/${kind}/${pinSha}/${modulePath.split("/").map(encodeURIComponent).join("/")}`,
  };
}

function normalizeDetectedSpdx(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  const aliases = new Map([
    ["apache license 2.0", "Apache-2.0"],
    ["apache 2.0", "Apache-2.0"],
    ["mit license", "MIT"],
    ["mozilla public license 2.0", "MPL-2.0"],
    ["gnu general public license v3.0", "GPL-3.0-only"],
    ["gnu general public license v2.0", "GPL-2.0-only"],
  ]);
  const normalized = aliases.get(text.toLowerCase()) || text;
  const allowed = new Set([
    "0BSD", "AGPL-3.0-only", "AGPL-3.0-or-later", "Apache-2.0", "Artistic-2.0",
    "BSD-2-Clause", "BSD-3-Clause", "BSL-1.0", "CC0-1.0", "EPL-2.0", "EUPL-1.2",
    "GPL-2.0-only", "GPL-2.0-or-later", "GPL-3.0-only", "GPL-3.0-or-later", "ISC",
    "LGPL-2.1-only", "LGPL-2.1-or-later", "LGPL-3.0-only", "LGPL-3.0-or-later",
    "MIT", "MPL-2.0", "Unlicense", "Zlib",
  ]);
  return allowed.has(normalized) ? normalized : "";
}

export function detectRepositoryLicenseSpdx(contentValue, filenameValue = "") {
  const content = String(contentValue || "");
  const filename = String(filenameValue || "").toLowerCase();
  const signals = new Set();
  for (const match of content.matchAll(/^\s*(?:[#/*-]+\s*)?SPDX-License-Identifier:\s*([^\r\n*]+?)\s*(?:\*\/)?\s*$/gim)) {
    const spdx = normalizeDetectedSpdx(match[1]);
    if (spdx) signals.add(spdx);
  }

  if (filename === "package.json") {
    try {
      const payload = JSON.parse(content);
      if (typeof payload?.license === "string") {
        const spdx = normalizeDetectedSpdx(payload.license);
        if (spdx) signals.add(spdx);
      }
    } catch {
      return "";
    }
  }
  if (["cargo.toml", "pyproject.toml"].includes(filename)) {
    const manifestLicense = content.match(/^\s*license\s*=\s*["']([^"']+)["']/mi)?.[1];
    if (manifestLicense) {
      const spdx = normalizeDetectedSpdx(manifestLicense);
      if (spdx) signals.add(spdx);
    }
  }
  if (filename === "pom.xml") {
    const name = content.match(/<license\b[^>]*>[\s\S]*?<name>\s*([^<]+?)\s*<\/name>[\s\S]*?<\/license>/i)?.[1];
    if (name) {
      const spdx = normalizeDetectedSpdx(name);
      if (spdx) signals.add(spdx);
    }
  }
  if (filename.endsWith(".gemspec")) {
    const gemLicense = content.match(/\.licenses?\s*=\s*(?:\[\s*)?["']([^"']+)["']/i)?.[1];
    if (gemLicense) {
      const spdx = normalizeDetectedSpdx(gemLicense);
      if (spdx) signals.add(spdx);
    }
  }

  if (/Permission is hereby granted, free of charge/i.test(content) && /THE SOFTWARE IS PROVIDED [“"]?AS IS/i.test(content)) signals.add("MIT");
  if (/Apache License/i.test(content) && /Version 2\.0/i.test(content)) signals.add("Apache-2.0");
  if (/Mozilla Public License/i.test(content) && /Version 2\.0/i.test(content)) signals.add("MPL-2.0");
  if (/GNU LESSER GENERAL PUBLIC LICENSE/i.test(content) && /Version 3/i.test(content)) signals.add("LGPL-3.0-only");
  if (/GNU LESSER GENERAL PUBLIC LICENSE/i.test(content) && /Version 2\.1/i.test(content)) signals.add("LGPL-2.1-only");
  if (/GNU GENERAL PUBLIC LICENSE/i.test(content) && /Version 3/i.test(content)) signals.add("GPL-3.0-only");
  if (/GNU GENERAL PUBLIC LICENSE/i.test(content) && /Version 2/i.test(content)) signals.add("GPL-2.0-only");
  if (/Permission to use, copy, modify, and\/or distribute this software for any purpose/i.test(content)) signals.add("ISC");
  if (/Redistribution and use in source and binary forms/i.test(content) && /Neither the name/i.test(content)) signals.add("BSD-3-Clause");
  else if (/Redistribution and use in source and binary forms/i.test(content)) signals.add("BSD-2-Clause");
  return signals.size === 1 ? [...signals][0] : "";
}

async function fetchGitHubRepositoryBlob(repositoryValue, blobShaValue, options = {}) {
  const repository = normalizeGitHubRepositoryUrl(repositoryValue);
  if (!repository) throw new Error(`Invalid GitHub repository: ${repositoryValue}`);
  const blobSha = String(blobShaValue || "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(blobSha)) throw new Error("Invalid GitHub blob SHA");
  const url = new URL(`https://api.github.com/repos/${repository.owner}/${repository.repo}/git/blobs/${blobSha}`);
  const payload = await fetchJson(url, { ...options, maxResponseBytes: Math.min(Number(options.maxResponseBytes || 750_000), 750_000) });
  if (String(payload?.sha || "").toLowerCase() !== blobSha || payload?.encoding !== "base64") {
    throw new Error("GitHub blob response identity or encoding mismatch");
  }
  const content = Buffer.from(String(payload?.content || "").replace(/\s+/g, ""), "base64");
  if (content.byteLength > 256_000 || (Number.isFinite(Number(payload?.size)) && Number(payload.size) !== content.byteLength)) {
    throw new Error("GitHub license blob size is invalid or exceeds 256000 bytes");
  }
  const gitBlobSha = createHash("sha1").update(`blob ${content.byteLength}\0`).update(content).digest("hex");
  if (gitBlobSha !== blobSha) throw new Error("GitHub license blob content does not match its tree SHA");
  return {
    sha: blobSha,
    content: content.toString("utf8"),
    contentSha256: createHash("sha256").update(content).digest("hex"),
  };
}

async function fetchGitHubRepositoryModuleLicenseAtTree(repositoryValue, moduleValue, verifiedModule, pinShaValue, options = {}) {
  const repository = normalizeGitHubRepositoryUrl(repositoryValue);
  const modulePath = normalizeRepositoryModulePath(moduleValue);
  const pinSha = String(pinShaValue || "").trim().toLowerCase();
  if (!repository || !modulePath || !/^[a-f0-9]{40}$/.test(pinSha)) throw new Error("Selected module license verification input is invalid");
  if (verifiedModule?.type !== "tree" || verifiedModule.path !== modulePath || !/^[a-f0-9]{40}$/i.test(String(verifiedModule.sha || ""))) {
    throw new Error("Automatic license verification requires a verified directory module");
  }

  const tree = await fetchGitHubRepositoryTree(repository.url, verifiedModule.sha, options);
  if (String(tree.sha || "").toLowerCase() !== String(verifiedModule.sha).toLowerCase() || tree.truncated) {
    throw new Error("Selected module license tree is incomplete or mismatched");
  }
  const regularBlobs = tree.entries.filter((entry) => entry.type === "blob" && ["100644", "100755"].includes(entry.mode));
  const explicit = regularBlobs
    .filter((entry) => /^(?:licen[cs]e(?:[._-].*)?|copying(?:[._-].*)?)$/i.test(entry.path))
    .sort((left, right) => left.path.localeCompare(right.path));
  const manifests = regularBlobs
    .filter((entry) => /^(?:package\.json|pyproject\.toml|cargo\.toml|pom\.xml|[^/]+\.gemspec)$/i.test(entry.path))
    .sort((left, right) => left.path.localeCompare(right.path));
  const candidates = [...explicit, ...manifests.filter((entry) => !explicit.some((item) => item.path === entry.path))];
  if (candidates.length === 0) throw new Error("Selected module has no module-local license evidence at the immutable pin");
  if (candidates.length > 6) throw new Error("Selected module has too many ambiguous module-local license files");

  const verified = [];
  for (const entry of candidates) {
    const blob = await fetchGitHubRepositoryBlob(repository.url, entry.sha, options);
    const spdx = detectRepositoryLicenseSpdx(blob.content, entry.path);
    if (explicit.includes(entry) && !spdx) throw new Error(`Module-local license file has no safely detected SPDX identity: ${entry.path}`);
    if (spdx) verified.push({ entry, blob, spdx });
  }
  if (verified.length === 0) throw new Error("Selected module manifests do not declare a safely detected SPDX license");
  const spdxValues = [...new Set(verified.map((item) => item.spdx))];
  if (spdxValues.length !== 1) throw new Error("Selected module contains conflicting module-local license identities");
  const selected = verified[0];
  const licensePath = `${modulePath}/${selected.entry.path}`;
  return {
    path: licensePath,
    blobSha: selected.blob.sha,
    contentSha256: selected.blob.contentSha256,
    spdx: selected.spdx,
    scope: "module-local",
    sourceUrl: `https://github.com/${repository.owner}/${repository.repo}/blob/${pinSha}/${licensePath.split("/").map(encodeURIComponent).join("/")}`,
  };
}

async function fetchGitHubLatestRelease(repositoryValue, options = {}) {
  const repository = normalizeGitHubRepositoryUrl(repositoryValue);
  if (!repository) throw new Error(`Invalid GitHub repository: ${repositoryValue}`);
  const url = new URL(`https://api.github.com/repos/${repository.owner}/${repository.repo}/releases/latest`);
  try {
    const payload = await fetchJson(url, options);
    return {
      tag: String(payload?.tag_name || ""),
      url: String(payload?.html_url || ""),
      publishedAt: String(payload?.published_at || ""),
    };
  } catch (error) {
    if (/GitHub request failed: 404\b/.test(error instanceof Error ? error.message : String(error))) return null;
    throw error;
  }
}

export async function fetchGitHubRepositorySnapshot(repositoryValue, options = {}) {
  const metadata = await fetchGitHubRepository(repositoryValue, options);
  if (!metadata) return null;
  const snapshotErrors = [];
  let head = null;
  let release = null;
  let verifiedPin = null;
  let verifiedModule = null;
  let verifiedLicense = null;
  try {
    head = await fetchGitHubRepositoryHead(metadata.repo.url, metadata.defaultBranch || "HEAD", options);
  } catch (error) {
    snapshotErrors.push(`head: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    release = await fetchGitHubLatestRelease(metadata.repo.url, options);
  } catch (error) {
    snapshotErrors.push(`release: ${error instanceof Error ? error.message : String(error)}`);
  }
  const requestedPin = String(options.pin || "").trim();
  if (requestedPin) {
    try {
      if (/^tree-sha:/i.test(requestedPin)) {
        verifiedPin = await fetchGitHubRepositoryTree(metadata.repo.url, requestedPin.slice("tree-sha:".length), options);
      } else {
        const commitSha = requestedPin.replace(/^commit:/i, "");
        if (!/^[a-f0-9]{40}$/i.test(commitSha)) throw new Error("Selected repository pin is not a 40-hex commit/tree SHA");
        verifiedPin = await fetchGitHubRepositoryHead(metadata.repo.url, commitSha, options);
      }
      const expectedSha = requestedPin.replace(/^(?:commit|tree-sha):/i, "").toLowerCase();
      if (String(verifiedPin?.sha || "").toLowerCase() !== expectedSha) throw new Error("Selected repository pin resolved to a different SHA");
      if (options.module) {
        const rootTreeSha = /^tree-sha:/i.test(requestedPin) ? verifiedPin.sha : verifiedPin.treeSha;
        verifiedModule = await fetchGitHubRepositoryModuleAtTree(metadata.repo.url, options.module, rootTreeSha, {
          ...options,
          pinSha: expectedSha,
        });
        verifiedLicense = await fetchGitHubRepositoryModuleLicenseAtTree(
          metadata.repo.url,
          options.module,
          verifiedModule,
          expectedSha,
          options,
        );
      }
    } catch (error) {
      snapshotErrors.push(`pin: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return {
    ...metadata,
    headSha: head?.sha || "",
    verifiedPinSha: verifiedPin?.sha || "",
    verifiedModulePath: verifiedModule?.path || "",
    verifiedModuleSha: verifiedModule?.sha || "",
    verifiedModuleType: verifiedModule?.type || "",
    verificationSourceUrl: verifiedModule?.sourceUrl || verifiedPin?.url || "",
    verifiedLicensePath: verifiedLicense?.path || "",
    verifiedLicenseBlobSha: verifiedLicense?.blobSha || "",
    verifiedLicenseContentSha256: verifiedLicense?.contentSha256 || "",
    verifiedLicenseSpdx: verifiedLicense?.spdx || "",
    verifiedLicenseSourceUrl: verifiedLicense?.sourceUrl || "",
    verifiedLicenseScope: verifiedLicense?.scope || "",
    latestReleaseTag: release?.tag || "",
    retrievedAt: new Date().toISOString(),
    snapshotErrors,
  };
}

export async function searchGitHubRepositoryCandidates(options = {}) {
  const topic = String(options.topic || "agent-harness").trim() || "agent-harness";
  const limit = Math.max(1, Math.min(Number(options.limit || 5) || 5, 25));
  const queries = Array.isArray(options.queries) && options.queries.length
    ? options.queries.map(String).filter(Boolean)
    : plannedGitHubRepositoryQueries(topic);
  if (!queries.length) throw new Error(`Unsupported GitHub repository research topic: ${topic}`);
  const seen = new Set();
  const candidates = [];

  for (const query of queries) {
    const result = await fetchGitHubRepositorySearch(query, limit, options);
    for (const item of result.items || []) {
      if (!isExplicitlyPublicGitHubApiRepository(item)) continue;
      const candidate = normalizeGitHubApiRepository(item);
      if (!candidate) continue;
      const key = candidate.repo.url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(candidate);
      if (candidates.length >= limit) break;
    }
    if (candidates.length >= limit) break;
  }

  return { topic, queries, candidates };
}
