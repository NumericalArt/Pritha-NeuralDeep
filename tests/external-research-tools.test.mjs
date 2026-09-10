import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  last30DaysConfig,
  last30daysPayloadToVoiceBrief,
  runRecentLast30DaysResearch,
  sanitizedLast30DaysEnv,
  statusForLast30Days,
} from "../scripts/external-research-tools.mjs";

function tempRoot() {
  return path.join(os.tmpdir(), `pritha-tools-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function writeLock(root) {
  const lockDir = path.join(root, "tools", "external-research");
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(path.join(lockDir, "last30days-lock.json"), JSON.stringify({
    tools: {
      last30days: {
        repo: "https://example.test/last30days.git",
        commit: "abc123",
        version: "3.8.0",
        python: ">=3.12",
        install_path: ".tools/external-research/last30days/abc123",
        engine_path: "skills/last30days/scripts/last30days.py",
      },
    },
  }));
}

function writeFakeBin(root) {
  const binDir = path.join(root, "bin");
  mkdirSync(binDir, { recursive: true });
  const pythonPath = path.join(binDir, "python3.12");
  writeFileSync(pythonPath, [
    "#!/bin/sh",
    "if [ \"$1\" = \"-c\" ]; then",
    `  echo '{"executable":"${pythonPath}","version":"3.12.2","major":3,"minor":12,"micro":2}'`,
    "  exit 0",
    "fi",
    "echo '{}'",
  ].join("\n"));
  chmodSync(pythonPath, 0o755);

  const gitPath = path.join(binDir, "git");
  writeFileSync(gitPath, [
    "#!/bin/sh",
    "if [ \"$1\" = \"--version\" ]; then echo 'git version 2.45.0'; exit 0; fi",
    "if [ \"$1\" = \"rev-parse\" ]; then echo 'abc123'; exit 0; fi",
    "exit 0",
  ].join("\n"));
  chmodSync(gitPath, 0o755);
  return binDir;
}

test("last30days lock resolves install and engine paths under root", () => {
  const root = tempRoot();
  writeLock(root);
  const config = last30DaysConfig({ root });
  assert.equal(config.commit, "abc123");
  assert.equal(config.installPath, path.join(root, ".tools/external-research/last30days/abc123"));
  assert.equal(config.enginePath, path.join(config.installPath, "skills/last30days/scripts/last30days.py"));
});

test("last30days status is pending-install when runtime is present but checkout is absent", () => {
  const root = tempRoot();
  writeLock(root);
  const binDir = writeFakeBin(root);
  const status = statusForLast30Days({
    root,
    env: { PATH: binDir },
    pythonCandidates: ["python3.12"],
  });

  assert.equal(status.status, "pending-install");
  assert.equal(status.ok, false);
  assert.equal(status.python.ok, true);
  assert.equal(status.git.ok, true);
  assert.deepEqual(status.issues, ["pinned checkout not installed"]);
});

test("sanitized last30days env strips secrets and can disable host tool PATH", () => {
  const fixtureHome = path.join(path.sep, "fixture-home");
  const env = sanitizedLast30DaysEnv({
    PATH: "/usr/bin:/bin",
    HOME: fixtureHome,
    OPENAI_API_KEY: "sk-secret",
    AUTH_TOKEN: "secret",
    PASSWORD_STORE_DIR: "/private/pass",
  }, {
    allowHostTools: false,
    extra: { LAST30DAYS_SKIP_PREFLIGHT: "1" },
  });

  assert.equal(env.HOME, fixtureHome);
  assert.equal(env.PATH, "");
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.AUTH_TOKEN, undefined);
  assert.equal(env.PASSWORD_STORE_DIR, undefined);
  assert.equal(env.CODEX_AUTH_FILE, "/dev/null");
  assert.equal(env.LAST30DAYS_CONFIG_DIR, "");
  assert.equal(env.LAST30DAYS_SKIP_PREFLIGHT, "1");
  assert.equal(env.FROM_BROWSER, "off");
  assert.equal(env.SETUP_COMPLETE, "true");
});

test("last30days payload becomes a bounded voice research brief", () => {
  const brief = last30daysPayloadToVoiceBrief("Codex voice control", {
    generated_at: "2026-06-25T12:00:00Z",
    ranked_candidates: [
      {
        source: "hackernews",
        title: "Codex voice control thread",
        url: "https://news.ycombinator.com/item?id=1",
        explanation: "Developers are discussing Codex voice task handoffs.",
        final_score: 42,
        source_items: [{ published_at: "2026-06-24" }],
      },
    ],
    items_by_source: {
      reddit: [
        {
          source: "reddit",
          title: "Voice agents workflow",
          url: "https://reddit.com/r/LocalLLaMA/example",
          snippet: "A user describes using voice to route coding tasks.",
          published_at: "2026-06-23",
          relevance_hint: 0.7,
        },
      ],
    },
  }, {
    searchSources: "reddit,hackernews,polymarket,grounding",
    maxResults: 4,
  });

  assert.equal(brief.coverage.quality, "medium");
  assert.deepEqual(brief.coverage.sources_used.sort(), ["hackernews", "reddit"]);
  assert.ok(brief.coverage.missing_sources.includes("polymarket"));
  assert.equal(brief.evidence_items.length, 2);
  assert.match(brief.summary, /Найдено 2 релевантных сигналов/);
  assert.ok(brief.key_findings.length >= 2);
});

test("recent last30days research rejects private or paid sources in default voice mode", () => {
  const root = tempRoot();
  writeLock(root);
  const privateVideoSource = "you" + "tube";
  const result = runRecentLast30DaysResearch({
    root,
    query: "Codex voice control",
    searchSources: ["reddit", privateVideoSource, "x", "perplexity"].join(","),
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "unsupported_sources");
  assert.deepEqual(result.rejected_sources, [privateVideoSource, "x", "perplexity"]);
});
