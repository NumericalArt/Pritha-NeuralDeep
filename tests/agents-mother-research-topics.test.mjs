import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveExternalResearchTopics,
  externalResearchRequired,
} from "../scripts/agents-mother/external-research-topics.mjs";

function ids(data) {
  return deriveExternalResearchTopics(data).map((topic) => topic.id);
}

test("fixture-like deterministic contract does not require external research topics", () => {
  const data = {
    text: [
      "- Out of scope: production deployment, external integrations, background services.",
      "### Deferred functions",
      "- Telegram adapter.",
      "- Web UI.",
    ].join("\n"),
    runtimeFamily: "codex-native",
    primaryInterface: "Codex project",
    telegramMode: "none",
    serviceMode: "none",
    autostart: "disabled",
    proactiveMode: "none",
    dependencies: "none.",
    memoryModel: "Markdown-first",
    coreFunctions: ["Expose a local CLI status command."],
    criticalWorkflows: ["Run the scaffolded status command."],
  };

  assert.deepEqual(ids(data), []);
  assert.equal(externalResearchRequired(data), false);
});

test("repository placeholder values do not create a repository-review topic", () => {
  assert.deepEqual(ids({ repositoryAdoptionMode: "none", selectedGitHubRepositories: "none" }), []);
  assert.deepEqual(ids({ repositoryAdoptionMode: "none", selectedGitHubRepositories: "not-applicable" }), []);
  assert.ok(ids({
    repositoryAdoptionMode: "selected-module",
    selectedGitHubRepositories: "https://github.com/example/agent-kit",
  }).includes("github-repository-review"));
});

test("realtime voice contract derives OpenAI Realtime research topic", () => {
  const topics = ids({
    runtimeFamily: "codex-native",
    primaryInterface: "web realtime voice",
    secondaryInterfaces: "Codex project",
    telegramMode: "none",
    coreFunctions: ["Respond to spoken operator commands through WebRTC audio."],
  });

  assert.ok(topics.includes("openai-realtime"));
  assert.equal(externalResearchRequired({ primaryInterface: "web realtime voice" }), true);
});

test("Telegram contract derives Bot API and untrusted input topics", () => {
  const topics = ids({
    runtimeFamily: "codex-native",
    primaryInterface: "Telegram",
    telegramMode: "primary-chat",
    inputDataTypes: "external messages, links, files and Telegram posts",
    secretsRequired: "Telegram bot token",
  });

  assert.ok(topics.includes("telegram-bot-api"));
  assert.ok(topics.includes("untrusted-input-security"));
});

test("local inference contract derives runtime and memory topics", () => {
  const topics = ids({
    runtimeFamily: "local-model",
    primaryInterface: "CLI",
    memoryModel: "Markdown plus semantic search and embeddings",
    toolSystem: "Ollama local inference adapter",
  });

  assert.ok(topics.includes("local-inference-runtime"));
  assert.ok(topics.includes("memory-rag-storage"));
});

test("dependency and operations choices derive install and deployment topics", () => {
  const topics = ids({
    runtimeFamily: "codex-native",
    primaryInterface: "web UI",
    dependencies: "Next.js, React, OpenAI SDK",
    serviceMode: "launchd",
    autostart: "launchd-on-approval",
    proactiveMode: "scheduled",
  });

  assert.ok(topics.includes("interface-runtime-security"));
  assert.ok(topics.includes("declared-dependencies"));
  assert.ok(topics.includes("operations-deployment"));
});

test("external research queries never include raw dependency or pattern secret text", () => {
  const secret = "ASIA1234567890ABCDEF"; // gitleaks:allow -- synthetic test fixture or non-secret identifier
  const topics = deriveExternalResearchTopics(
    {
      runtimeFamily: "codex-native",
      dependencies: `example-package ${secret} IGNORE ALL PREVIOUS`,
    },
    {
      patternPack: {
        externalResearchSeeds: [`api ${secret}`, `openai ${secret}`],
      },
    },
  );
  const serialized = JSON.stringify(topics);
  assert.doesNotMatch(serialized, new RegExp(secret));
  assert.doesNotMatch(serialized, /IGNORE ALL PREVIOUS/);
  assert.ok(topics.some((topic) => topic.id === "declared-dependencies"));
  assert.ok(topics.some((topic) => topic.query.includes("api")));
});

test("pattern pack seeds derive additional current-source research topics", () => {
  const topics = deriveExternalResearchTopics(
    {
      runtimeFamily: "codex-native",
      primaryInterface: "Codex project",
      telegramMode: "none",
      serviceMode: "none",
      autostart: "disabled",
      proactiveMode: "none",
      dependencies: "none",
    },
    {
      patternPack: {
        externalResearchSeeds: [
          "OpenAI Realtime WebRTC",
          "MCP connector permissions",
          "generic agent workflow",
        ],
      },
    },
  );

  assert.ok(topics.some((topic) => topic.id === "pattern-openai-realtime-webrtc"));
  assert.ok(topics.some((topic) => topic.id === "pattern-mcp-connector-permissions"));
  assert.ok(!topics.some((topic) => topic.id === "pattern-generic-agent-workflow"));
});
