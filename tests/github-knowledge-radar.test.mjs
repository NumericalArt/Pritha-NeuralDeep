import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  fetchGitHubRepositorySearch,
  normalizeGitHubRepositoryUrl,
  searchGitHubRepositoryCandidates,
} from "../scripts/lib/github-repository-radar.mjs";

const PROJECT_ROOT = path.resolve(".");

test("GitHub repository URL normalization rejects encoded paths and endpoint confusion", () => {
  for (const value of [
    "https://github.com/../user",
    "https://github.com/%2e%2e/user%2femails",
    "https://github.com/owner/repo/issues",
    "https://github.com/owner/repo?token=value",
    "https://github.com/-owner/repo",
  ]) {
    assert.equal(normalizeGitHubRepositoryUrl(value), null, value);
  }
  assert.equal(normalizeGitHubRepositoryUrl("https://github.com/owner/repo.git").url, "https://github.com/owner/repo");
});

function runRadar(args, root, options = {}) {
  const result = spawnSync("node", ["scripts/github-knowledge-radar.mjs", ...args, "--json"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, TECHSCOPE_ROOT: root, ...(options.env || {}) },
  });
  if (options.check !== false) {
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  return {
    status: result.status,
    payload: JSON.parse(result.stdout),
  };
}

test("GitHub Knowledge Radar initializes and registers repository candidates", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-radar-"));
  try {
    const status = runRadar(["status"], root);
    assert.equal(status.payload.status, "not_initialized");

    const registered = runRadar(
      [
        "register",
        "--repo",
        "https://github.com/example/agent-kit",
        "--topics",
        "agent-harness,mcp-tools",
        "--why",
        "Useful architecture reference",
        "--stars",
        "42",
      ],
      root,
    );
    assert.equal(registered.payload.status, "registered");

    const registry = readFileSync(path.join(root, "01_sources", "registries", "github-agent-building-repos.md"), "utf8");
    assert.match(registry, /https:\/\/github\.com\/example\/agent-kit/);
    assert.match(registry, /agent-harness, mcp-tools/);

    const duplicate = runRadar(["register", "--repo", "git@github.com:example/agent-kit.git"], root);
    assert.equal(duplicate.payload.status, "already_registered");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GitHub Knowledge Radar rejects adoption-mode names as registry review statuses", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-radar-status-schema-"));
  try {
    const result = runRadar([
      "register",
      "--repo",
      "https://github.com/example/reference-only-is-not-a-review-status",
      "--topics",
      "agent-harness",
      "--status",
      "reference-only",
    ], root, { check: false });
    assert.equal(result.status, 1);
    assert.equal(result.payload.status, "invalid_registry_metadata");
    assert.equal(result.payload.ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GitHub Knowledge Radar rejects symlinked registry files and parent directories", () => {
  const outside = mkdtempSync(path.join(os.tmpdir(), "pritha-radar-registry-outside-"));
  for (const boundary of ["file", "parent"]) {
    const root = mkdtempSync(path.join(os.tmpdir(), `pritha-radar-registry-${boundary}-`));
    try {
      const registryDirectory = path.join(root, "01_sources", "registries");
      const outsideRegistry = path.join(outside, `${boundary}-registry.md`);
      let guardedRegistry = outsideRegistry;
      if (boundary === "file") {
        mkdirSync(registryDirectory, { recursive: true });
        writeFileSync(outsideRegistry, "# outside registry\n");
        symlinkSync(outsideRegistry, path.join(registryDirectory, "github-agent-building-repos.md"));
      } else {
        mkdirSync(path.join(root, "01_sources"), { recursive: true });
        const inRootDirectory = path.join(root, "registry-target");
        mkdirSync(inRootDirectory, { recursive: true });
        guardedRegistry = path.join(inRootDirectory, "github-agent-building-repos.md");
        writeFileSync(guardedRegistry, "# in-root symlink target registry\n");
        symlinkSync("../registry-target", registryDirectory);
      }

      const status = runRadar(["status"], root, { check: false });
      assert.equal(status.status, 1, boundary);
      assert.equal(status.payload.status, "unsafe_registry", boundary);
      assert.equal(status.payload.candidates, 0, boundary);

      const before = existsSync(guardedRegistry) ? readFileSync(guardedRegistry, "utf8") : "missing";
      const registered = runRadar([
        "register",
        "--repo",
        "https://github.com/example/must-not-write-through-symlink",
        "--topics",
        "agent-harness",
      ], root, { check: false });
      assert.equal(registered.status, 1, boundary);
      assert.equal(registered.payload.status, "unsafe_registry", boundary);
      const after = existsSync(guardedRegistry) ? readFileSync(guardedRegistry, "utf8") : "missing";
      assert.equal(after, before, boundary);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  rmSync(outside, { recursive: true, force: true });
});

test("GitHub Knowledge Radar rejects symlinked fixtures before reading them", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-radar-fixture-symlink-"));
  const outside = mkdtempSync(path.join(os.tmpdir(), "pritha-radar-fixture-outside-"));
  try {
    const outsideFixture = path.join(outside, "fixture.json");
    const fixtureLink = path.join(root, "fixture.json");
    writeFileSync(outsideFixture, JSON.stringify({ items: [{ html_url: "https://github.com/example/outside" }] }));
    symlinkSync(outsideFixture, fixtureLink);
    const result = runRadar(["search", "--topic", "agent-harness"], root, {
      check: false,
      env: { PRITHA_GITHUB_RADAR_FIXTURE: fixtureLink },
    });
    assert.equal(result.status, 1);
    assert.equal(result.payload.status, "failed");
    assert.deepEqual(result.payload.candidates, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("GitHub Knowledge Radar recognizes backtick-wrapped registry URLs and their metadata", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-radar-markdown-"));
  try {
    runRadar(["init"], root);
    const registryPath = path.join(root, "01_sources", "registries", "github-agent-building-repos.md");
    const registry = readFileSync(registryPath, "utf8");
    writeFileSync(
      registryPath,
      `${registry}| \`https://github.com/Example/Agent-Kit\` | agent-harness; mcp-tools | accepted-for-review | 2026-07-01 | 2026-07-12 | 1,982 | Useful architecture \\| eval reference. | Review before adoption. |\n`,
    );

    const status = runRadar(["status"], root);
    assert.equal(status.payload.candidates, 1);
    assert.deepEqual(status.payload.byStatus, { "accepted-for-review": 1 });

    const duplicate = runRadar(["register", "--repo", "git@github.com:example/agent-kit.git"], root);
    assert.equal(duplicate.payload.status, "already_registered");
    assert.equal(duplicate.payload.existing.repo, "https://github.com/Example/Agent-Kit");
    assert.equal(duplicate.payload.existing.stars, 1982);
    assert.equal(duplicate.payload.existing.why, "Useful architecture | eval reference.");

    const unchangedRegistry = readFileSync(registryPath, "utf8");
    assert.equal(unchangedRegistry.match(/github\.com\/Example\/Agent-Kit/gi)?.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GitHub Knowledge Radar keeps search offline until online mode is requested", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-radar-offline-"));
  try {
    const result = runRadar(["search", "--topic", "agent-memory", "--limit", "2"], root);
    assert.equal(result.payload.status, "planned");
    assert.equal(result.payload.source, "planned");
    assert.equal(result.payload.online, false);
    assert.deepEqual(result.payload.candidates, []);
    assert.deepEqual(result.payload.plannedQueries, [
      "AI agent memory vector database workflow stars:>25 is:public",
      "LLM memory retrieval agent stars:>25 is:public",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GitHub Knowledge Radar search can run from a fixture without network access", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-radar-fixture-"));
  const fixture = path.join(root, "fixture.json");
  try {
    writeFileSync(
      fixture,
      JSON.stringify({
        items: [
          {
            html_url: "https://github.com/example/agent-evals",
            description: "Agent evaluation toolkit",
            stargazers_count: 123,
            language: "TypeScript",
            topics: ["agents", "evals"],
          },
        ],
      }),
    );
    const result = runRadar(["search", "--topic", "agent-evals"], root, {
      env: { PRITHA_GITHUB_RADAR_FIXTURE: fixture },
    });
    assert.equal(result.payload.status, "candidates_found");
    assert.equal(result.payload.source, "fixture");
    assert.equal(result.payload.online, false);
    assert.equal(result.payload.candidates[0].repo.fullName, "example/agent-evals");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GitHub Knowledge Radar rejects arbitrary online topics without echoing them", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-radar-topic-"));
  try {
    const secretTopic = "mission-AKIA1234567890ABCDEF"; // gitleaks:allow -- synthetic test fixture or non-secret identifier
    const result = runRadar(["search", "--topic", secretTopic, "--online"], root, { check: false });
    assert.equal(result.status, 1);
    assert.equal(result.payload.status, "invalid_topic");
    assert.equal(result.payload.topic, "rejected");
    assert.doesNotMatch(JSON.stringify(result.payload), /AKIA1234567890ABCDEF/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GitHub Knowledge Radar bounds fixtures and clamps negative limits", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-radar-bounds-"));
  const fixture = path.join(root, "fixture.json");
  const oversized = path.join(root, "oversized.json");
  try {
    writeFileSync(fixture, JSON.stringify({ items: [1, 2, 3].map((id) => ({
      html_url: `https://github.com/example/repo-${id}`,
      description: `candidate ${id}`,
    })) }));
    const clamped = runRadar(["search", "--topic", "agent-harness", "--limit", "-1"], root, {
      env: { PRITHA_GITHUB_RADAR_FIXTURE: fixture },
    });
    assert.equal(clamped.payload.candidates.length, 1);

    writeFileSync(oversized, JSON.stringify({ padding: "x".repeat(2_000_001) }));
    const rejected = runRadar(["search", "--topic", "agent-harness"], root, {
      check: false,
      env: { PRITHA_GITHUB_RADAR_FIXTURE: oversized },
    });
    assert.equal(rejected.status, 1);
    assert.equal(rejected.payload.status, "failed");
    assert.match(rejected.payload.error, /2 MB/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GitHub radar filters private API results and enforces streamed response limits", async () => {
  const response = (payload) => ({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => null },
    text: async () => JSON.stringify(payload),
  });
  const result = await searchGitHubRepositoryCandidates({
    topic: "agent-harness",
    queries: ["agent harness is:public"],
    limit: 5,
    fetchImpl: async () => response({ items: [
      { html_url: "https://github.com/internal/private-kit", private: true, visibility: "private" },
      { html_url: "https://github.com/example/public-kit", private: false, visibility: "public" },
      { html_url: "https://github.com/example/ambiguous-kit" },
    ] }),
  });
  assert.deepEqual(result.candidates.map((candidate) => candidate.repo.fullName), ["example/public-kit"]);

  const oversizedStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`{"padding":"${"x".repeat(2_000)}"}`));
      controller.close();
    },
  });
  await assert.rejects(
    fetchGitHubRepositorySearch("agent harness is:public", 1, {
      maxResponseBytes: 1_024,
      fetchImpl: async () => new Response(oversizedStream, { status: 200 }),
    }),
    /exceeds 1024 byte limit/,
  );
});

test("registry writes redact secrets and neutralize active Markdown", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-radar-redaction-"));
  try {
    const result = runRadar([
      "register",
      "--repo",
      "https://github.com/example/safe-kit",
      "--topics",
      "agent-harness",
      "--why",
      "![track](https://tracker.example/pixel) ASIA1234567890ABCDEF",
      "--notes",
      "Bearer abcdefghijklmnopqrstuvwxyz",
    ], root);
    assert.equal(result.payload.status, "registered");
    const registry = readFileSync(path.join(root, "01_sources", "registries", "github-agent-building-repos.md"), "utf8");
    assert.doesNotMatch(registry, /ASIA1234567890ABCDEF|abcdefghijklmnopqrstuvwxyz/);
    assert.match(registry, /REDACTED_AWS_KEY|REDACTED/);
    assert.doesNotMatch(registry, /!\[/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
