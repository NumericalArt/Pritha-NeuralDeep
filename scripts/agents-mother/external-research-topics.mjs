import { canonicalPatternResearchSeed, parsePatternPackSeeds } from "./pattern-research.mjs";
import { normalizeGitHubRepositoryUrl } from "../lib/github-repository-radar.mjs";

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function hasSelectedGitHubRepository(value) {
  const matches = String(value || "").match(/https:\/\/github\.com\/[^\s,;`]+/gi) || [];
  return matches.some((candidate) => normalizeGitHubRepositoryUrl(candidate));
}

function slug(value, fallback = "pattern") {
  const text = String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return text || fallback;
}

function combinedContractText(data = {}) {
  return [
    data.agentName,
    data.primaryMission,
    data.runtimeFamily,
    data.runtimePlacementProfile,
    data.primaryInterface,
    data.secondaryInterfaces,
    data.telegramMode,
    data.expectedHosting,
    data.deploymentTarget,
    data.deploymentProfile,
    data.serviceMode,
    data.autostart,
    data.proactiveMode,
    data.memoryModel,
    data.indexingSearchNeeds,
    data.toolSystem,
    data.inputDataTypes,
    data.sensitiveData,
    data.dependencies,
    data.allowedNetworkAccess,
    data.secretsRequired,
    data.repositoryResearchPolicy,
    data.repositoryResearchTopics,
    data.repositoryAdoptionMode,
    data.selectedGitHubRepositories,
    data.coreFunctions?.join(" "),
    data.criticalWorkflows?.join(" "),
  ].filter(Boolean).join("\n").toLowerCase();
}

function pushTopic(topics, id, topic, query, reason, extra = {}) {
  if (topics.some((item) => item.id === id)) return;
  topics.push({
    id,
    topic,
    query,
    reason,
    required: extra.required !== false,
    preferredSources: extra.preferredSources || ["official-docs", "changelog", "github", "trusted-secondary"],
    freshnessWindowDays: extra.freshnessWindowDays || 30,
  });
}

function addPatternDerivedTopics(topics, patternPack) {
  const seeds = parsePatternPackSeeds(patternPack)
    .map((seed) => canonicalPatternResearchSeed(compact(seed)))
    .filter(Boolean)
    .filter((seed) => /\b(openai|realtime|webrtc|voice|speech|telegram|bot api|mcp|connector|embeddings?|semantic|vector|rag|sqlite|next\.?js|react|launchd|cron|tailscale|oauth|webhook|browser|sandbox|codex app|codex cli|agents sdk|github|repository|skill|eval|evaluation|open-source|api)\b/i.test(seed))
    .slice(0, 5);

  for (const seed of seeds) {
    pushTopic(
      topics,
      `pattern-${slug(seed)}`,
      `Current-source check for memory pattern: ${seed}`,
      `current official documentation changelog security discussion ${seed} agent harness`,
      "Selected Pritha memory pattern produced this external research seed.",
      { preferredSources: ["official-docs", "github", "changelog", "trusted-secondary"] },
    );
  }
}

export function deriveExternalResearchTopics(data = {}, options = {}) {
  const text = combinedContractText(data);
  const topics = [];
  const runtime = String(data.runtimeFamily || "").trim();
  const telegramMode = String(data.telegramMode || "none").trim();
  const serviceMode = String(data.serviceMode || "none").trim();
  const autostart = String(data.autostart || "disabled").trim();
  const proactiveMode = String(data.proactiveMode || "none").trim();
  const repositoryAdoptionMode = String(data.repositoryAdoptionMode || "none").trim();

  if (runtime === "api" && serviceMode === "process") {
    pushTopic(topics, "node-http-runtime", "Node.js HTTP process service and host APIs",
      "Node.js current HTTP server lifecycle os fs statfs child_process execFile documentation",
      "Explicit API process service requires HTTP/runtime evidence, without implying a model SDK.",
      { preferredSources: ["official-docs", "changelog"] });
  }
  if ((runtime === "api" && serviceMode !== "process") || /\bopenai agents sdk\b|\bagents sdk\b/.test(text)) {
    pushTopic(
      topics,
      "openai-agents-sdk",
      "OpenAI Agents SDK current APIs and safety model",
      "OpenAI Agents SDK current documentation tools handoffs guardrails tracing state",
      "API runtime or Agents SDK mentioned in the contract.",
      { preferredSources: ["official-docs", "changelog", "github"] },
    );
  }

  if (runtime === "local-model" || /\b(ollama|lm studio|vllm|local inference|local model|quantization)\b/.test(text)) {
    pushTopic(
      topics,
      "local-inference-runtime",
      "Local inference runtime, model license and hardware requirements",
      "local inference runtime model license hardware requirements current documentation",
      "Local model or local inference selected.",
    );
  }

  if (runtime === "hybrid" || runtime === "environment-specific") {
    pushTopic(
      topics,
      "platform-runtime-compatibility",
      "Platform-specific runtime compatibility",
      "current platform runtime compatibility deployment configuration agent harness",
      "Hybrid or environment-specific runtime selected.",
    );
  }

  if (telegramMode !== "none" || /\btelegram\b/.test(text)) {
    pushTopic(
      topics,
      "telegram-bot-api",
      "Telegram Bot API and adapter security",
      "Telegram Bot API current documentation long polling webhooks file downloads message limits bot token security",
      "Telegram interface selected or mentioned.",
      { preferredSources: ["official-docs", "security-docs", "trusted-secondary"] },
    );
  }

  if (/\b(realtime|voice|speech|microphone|audio|webrtc|transcription|gpt-realtime)\b/.test(text)) {
    pushTopic(
      topics,
      "openai-realtime",
      "OpenAI Realtime API and voice model behavior",
      "OpenAI Realtime API current documentation client secrets calls WebRTC transcription model voice behavior",
      "Realtime voice, audio, speech or transcription selected.",
      { preferredSources: ["official-docs", "changelog"] },
    );
  }

  if (/\b(mcp|model context protocol|connector|apps sdk|mcp app)\b/.test(text)) {
    pushTopic(
      topics,
      "mcp-connectors",
      "MCP connector and app security/current APIs",
      "Model Context Protocol MCP connector app current documentation security auth tool permissions",
      "MCP or connector capability mentioned.",
      { preferredSources: ["official-docs", "specification", "security-docs"] },
    );
  }

  if (/\b(embeddings|semantic search|vector|qdrant|lancedb|neo4j|kuzu|rag)\b/.test(text)) {
    pushTopic(
      topics,
      "memory-rag-storage",
      "Memory, RAG and storage dependency choices",
      "current RAG memory embeddings vector database storage dependency documentation agent",
      "Semantic memory, embeddings, vector store, graph store or RAG mentioned.",
    );
  }

  if (/\b(web ui|next\.js|react|browser|api|webhook|public endpoint|external service)\b/.test(text)) {
    pushTopic(
      topics,
      "interface-runtime-security",
      "Interface runtime and network security",
      "current web agent interface runtime security CORS auth webhook browser API safety",
      "Web/API/external interface selected or mentioned.",
      { preferredSources: ["official-docs", "security-docs"] },
    );
  }

  if (
    serviceMode !== "none"
    || autostart !== "disabled"
    || proactiveMode !== "none"
    || /\b(launchd|cron|service|daemon|heartbeat|scheduler|queue watcher|deployment|vps|cloud|mac mini)\b/.test(text)
  ) {
    pushTopic(
      topics,
      "operations-deployment",
      "Operations, deployment and proactive execution constraints",
      "current macOS launchd cron service deployment agent safety background scheduler best practices",
      "Service, autostart, deployment or proactive execution selected.",
      { preferredSources: ["official-docs", "security-docs", "trusted-secondary"] },
    );
  }

  if (/\b(untrusted|external messages|email|telegram posts|links|uploads|files|screenshots|media|transcripts)\b/.test(text)) {
    pushTopic(
      topics,
      "untrusted-input-security",
      "Untrusted input security and quarantine",
      "current agent untrusted input prompt injection quarantine scanner validation security best practices",
      "External or untrusted input appears in the contract.",
      { preferredSources: ["security-docs", "trusted-secondary", "official-docs"] },
    );
  }

  if (repositoryAdoptionMode !== "none" || hasSelectedGitHubRepository(data.selectedGitHubRepositories)) {
    pushTopic(
      topics,
      "github-repository-review",
      "Selected GitHub repository provenance and adoption review",
      "selected GitHub repository current HEAD release license maintainer security permissions supply chain evaluation",
      "The contract explicitly references a GitHub repository or repository adoption mode.",
      { preferredSources: ["github", "official-docs", "security-docs"] },
    );
  }

  const dependencies = compact(data.dependencies);
  const normalizedDependencies = dependencies.replace(/[.\s]+$/g, "");
  if (dependencies && !/^(none|minimal|tbd|unknown|not-applicable)$/i.test(normalizedDependencies)) {
    pushTopic(
      topics,
      "declared-dependencies",
      "Declared dependency versions and install safety",
      "current dependency versions changelog security install documentation agent runtime",
      "Contract declares dependencies that should be checked before scaffold.",
      { preferredSources: ["official-docs", "github", "changelog"] },
    );
  }

  addPatternDerivedTopics(topics, options.patternPack || options.patternPackText);

  return topics;
}

export function externalResearchRequired(data = {}, options = {}) {
  return deriveExternalResearchTopics(data, options).some((topic) => topic.required);
}
