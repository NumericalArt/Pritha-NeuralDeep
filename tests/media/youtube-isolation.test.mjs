import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const banned = [
  new RegExp("you" + "tube", "i"),
  new RegExp("you" + "tu\\.be", "i"),
  new RegExp("you" + "tube\\.com", "i"),
  new RegExp("yt" + "-dlp", "i"),
  new RegExp("yt" + "_dlp", "i"),
  new RegExp("watch" + "\\?v=", "i"),
  new RegExp("shorts" + "/", "i"),
];

const excluded = [
  path.join("scripts", "media", "adapters", "you" + "tube") + path.sep,
  path.join("tests", "media", "adapters", "you" + "tube") + path.sep,
  "00_inbox" + path.sep,
  "01_sources" + path.sep,
  "02_briefs" + path.sep,
  "03_reviews" + path.sep,
  "10_wiki" + path.sep,
  path.join("scripts", "lib", "privacy.mjs"),
];

function filesForIsolationCheck() {
  const result = spawnSync("git", [
    "ls-files",
    "-z",
    "--",
    "scripts",
    "07_workflows",
    "08_templates",
    "tests",
    "AGENTS.md",
    "README.ru.md",
    "requirements.txt",
    "tools/manifest.json",
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout
    .split("\0")
    .filter(Boolean)
    .filter((file) => !excluded.some((prefix) => file.split(path.sep).join(path.sep).startsWith(prefix)))
    .filter((file) => file !== path.join("tests", "media", "you" + "tube-isolation.test.mjs"));
}

test("platform-specific media strings stay inside the removable adapter", () => {
  const violations = [];
  for (const file of filesForIsolationCheck()) {
    const text = readFileSync(path.join(repoRoot, file), "utf8");
    for (const pattern of banned) {
      if (pattern.test(text)) violations.push(file);
    }
  }
  assert.deepEqual([...new Set(violations)].sort(), []);
});
