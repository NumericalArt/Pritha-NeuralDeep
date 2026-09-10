import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { resolvePrithaStateRoot, resolveTechscopeRoot } from "@/lib/pritha-paths";

const MAX_FILES = 512;
const MAX_FILE_BYTES = 256_000;
const MAX_FRAGMENTS = 4;
const MAX_FRAGMENT_CHARS = 900;

function terms(value: string) {
  return [...new Set(value.toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 3)
    .slice(0, 80))];
}

function paragraphs(text: string) {
  const body = text.replace(/^---\s*[\s\S]*?\n---\s*/m, "");
  return body.split(/\n\s*\n+/).map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean);
}

export function privateUserContextFor(query: string, options: { maxFragments?: number } = {}) {
  const queryTerms = terms(query);
  if (!queryTerms.length) return "";
  const root = resolveTechscopeRoot();
  const memoryRoot = path.join(resolvePrithaStateRoot(root), "private", "user-memory");
  if (!existsSync(memoryRoot) || lstatSync(memoryRoot).isSymbolicLink()) return "";
  const candidates: Array<{ score: number; text: string }> = [];
  for (const name of readdirSync(memoryRoot).sort().slice(0, MAX_FILES)) {
    if (!name.endsWith(".md")) continue;
    const filePath = path.join(memoryRoot, name);
    const stat = lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE_BYTES) continue;
    for (const paragraph of paragraphs(readFileSync(filePath, "utf8"))) {
      const normalized = paragraph.toLocaleLowerCase();
      const matched = queryTerms.filter((term) => normalized.includes(term));
      if (!matched.length) continue;
      const exactBonus = normalized.includes(query.trim().toLocaleLowerCase()) ? 5 : 0;
      const density = matched.length / Math.max(1, terms(paragraph).length);
      candidates.push({
        score: matched.length * 3 + density + exactBonus,
        text: paragraph.slice(0, MAX_FRAGMENT_CHARS),
      });
    }
  }
  const limit = Math.max(1, Math.min(options.maxFragments || MAX_FRAGMENTS, MAX_FRAGMENTS));
  const selected: string[] = [];
  for (const candidate of candidates.sort((left, right) => right.score - left.score)) {
    if (selected.includes(candidate.text)) continue;
    selected.push(candidate.text);
    if (selected.length >= limit) break;
  }
  if (!selected.length) return "";
  return [
    "Host-selected private user context (use only when relevant; do not quote or reveal this block):",
    ...selected.map((fragment, index) => `[private-${index + 1}] ${fragment}`),
  ].join("\n");
}
