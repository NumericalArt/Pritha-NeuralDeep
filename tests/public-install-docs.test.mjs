import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function text(filePath) {
  return readFileSync(filePath, "utf8");
}

test("public install docs use bootstrap as the fresh-clone entrypoint", () => {
  const publicDocs = [
    "README.md",
    "docs/getting-started.md",
    "docs/prerequisites.md",
    "docs/troubleshooting.md",
    "interfaces/control-center/README.md",
  ];
  for (const file of publicDocs) {
    const body = text(file);
    assert.match(body, /bootstrap\.mjs/, `${file} should mention bootstrap`);
  }

  const freshCloneDocs = [
    "README.md",
    "docs/getting-started.md",
    "docs/github-publish-and-push.md",
  ];
  for (const file of freshCloneDocs) {
    const body = text(file);
    assert.doesNotMatch(body, /cp \.env\.example \.env/, `${file} should not require copying .env for fresh clone`);
    assert.doesNotMatch(body, /setup\.mjs --non-interactive/, `${file} should not use setup.mjs as the fresh-clone path`);
  }
});

test("NeuralDeep installation is tool-neutral and includes its runtime prerequisites", () => {
  const readme = text("README.md");
  assert.match(readme, /Cursor, Codex, Claude Code/);
  assert.match(readme, /bootstrap\.mjs prepare --profile neuraldeep/);
  assert.match(readme, /Codex CLI is still/);
  assert.match(readme, /localhost/);
  assert.match(readme, /Brief Desk ND/);
  assert.match(readme, /own NeuralDeep API key/);
});

test("interface manifests distinguish current Control Center and integrated Voice from legacy Voice", () => {
  const interfaces = JSON.parse(text("interfaces/manifest.json"));
  const controlCenterManifest = JSON.parse(text("interfaces/control-center/manifest.json"));
  const controlCenter = interfaces.adapters.find((adapter) => adapter.name === "pritha-control-center");
  const legacyVoice = interfaces.adapters.find((adapter) => adapter.name === "pritha-voice-control");

  assert.equal(interfaces.primary_interface, "Codex project");
  assert.equal(controlCenter?.status, "active");
  assert.equal(controlCenterManifest.status, "active");
  assert.equal(legacyVoice?.status, "deprecated");
  assert.equal(legacyVoice?.replaced_by, "pritha-control-center");
  assert.equal(legacyVoice?.replacement_url, "http://127.0.0.1:3420/voice");
});

test("README.ru points to the canonical public README instead of duplicating stale claims", () => {
  const body = text("README.ru.md");
  assert.match(body, /\[канонический README\]\(README\.md\)/);
  assert.doesNotMatch(body, /^---$/m);
  assert.doesNotMatch(body, /# Artifact:/);
  assert.doesNotMatch(body, /agents-mother\.mjs/);
});

test("canonical public docs explain outcome delivery, Goals, cleanup and instance isolation", () => {
  const readme = text("README.md");
  const gettingStarted = text("docs/getting-started.md");
  const architecture = text("docs/architecture.md");
  const canonical = `${readme}\n${gettingStarted}\n${architecture}`;

  assert.match(canonical, /outcome init → outcome approve → deliver → delivery accept/);
  assert.match(canonical, /separately approved Outcome Spec/i);
  assert.match(canonical, /`verified` means automated Trials passed[\s\S]*records `accepted`/);
  assert.match(canonical, /disposable.*worktree/is);
  assert.match(canonical, /typed blocker/i);
  assert.match(canonical, /1,000,000/);
  assert.match(canonical, /Goal/i);
  assert.match(canonical, /local Trial backend.*not.*sandbox/is);
  assert.match(canonical, /instance-local/i);
  assert.match(readme, /Pre-existing conversation databases are never shipped/);
  assert.match(gettingStarted, /delivery cleanup <run-id> --apply --yes/);
});

test("local Markdown links in the public packaging files resolve", () => {
  const files = ["README.md", "README.ru.md", "docs/getting-started.md", "docs/architecture.md"];
  const markdownLink = /(?<!!)\[[^\]]+\]\(([^)]+)\)/g;

  for (const file of files) {
    const body = text(file);
    for (const match of body.matchAll(markdownLink)) {
      const target = match[1].trim();
      if (/^(?:https?:|mailto:|#)/i.test(target)) continue;
      const pathOnly = target.split("#", 1)[0].split("?", 1)[0];
      const resolved = path.resolve(path.dirname(file), decodeURIComponent(pathOnly));
      assert.ok(existsSync(resolved), `${file} links to missing local target ${target}`);
    }
  }
});
