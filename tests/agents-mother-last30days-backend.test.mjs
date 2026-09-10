import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildLast30DaysArgs,
  last30daysJsonToEvidence,
  runLast30DaysBackend,
} from "../scripts/agents-mother/external-research-last30days.mjs";

const topic = {
  id: "openai-realtime",
  topic: "OpenAI Realtime API and voice model behavior",
  query: "OpenAI Realtime API current documentation WebRTC transcription",
  freshnessWindowDays: 30,
  required: true,
};

function tempRoot() {
  return path.join(os.tmpdir(), `pritha-l30-backend-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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

test("last30days JSON maps ranked candidates into Pritha evidence items", () => {
  const payload = {
    topic: topic.query,
    generated_at: "2026-06-22T12:00:00Z",
    ranked_candidates: [{
      source: "github",
      title: "Realtime API changelog entry",
      url: "https://github.com/openai/openai-node/releases/tag/v1.2.3",
      snippet: "Realtime client behavior changed in the current SDK.",
      explanation: "Recent release note mentions Realtime session handling.",
      final_score: 0.82,
      source_items: [{ published_at: "2026-06-20" }],
    }],
    items_by_source: {
      hackernews: [{
        source: "hackernews",
        title: "Developer thread",
        url: "https://news.ycombinator.com/item?id=1",
        snippet: "Developers discuss WebRTC setup friction.",
        published_at: "2026-06-21",
      }],
    },
  };

  const evidence = last30daysJsonToEvidence(topic, payload);
  assert.equal(evidence.length, 2);
  assert.equal(evidence[0].topic_id, "openai-realtime");
  assert.equal(evidence[0].source_type, "github");
  assert.equal(evidence[0].source_published, "2026-06-20");
  assert.match(evidence[0].claim, /Recent release note/);
  assert.match(evidence[1].risk_note, /Community\/social evidence/);
});

test("last30days args use JSON, quick mode, lookback and keyless-first source set", () => {
  const args = buildLast30DaysArgs("/tmp/last30days.py", topic, { asOfDate: "2026-06-22" });
  assert.deepEqual(args, [
    "/tmp/last30days.py",
    topic.query,
    "--emit",
    "json",
    "--quick",
    "--days",
    "30",
    "--as-of",
    "2026-06-22",
    "--search",
    "github,hackernews,reddit,grounding",
  ]);
});

test("last30days backend reports unavailable when pinned runtime is absent", () => {
  const root = tempRoot();
  writeLock(root);
  const result = runLast30DaysBackend({ relPath: "11_agents/contracts/example.md" }, [topic], {
    root,
    env: { PATH: "" },
    pythonCandidates: ["python3.12"],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "last30days_backend_unavailable");
  assert.equal(result.status.status, "pending-runtime");
  assert.match(result.status.issues.join("; "), /python>=3\.12 not found/);
});
