import { readFileSync } from "node:fs";
import { contractData } from "../../scripts/agents-mother/contract.mjs";

export function scaffoldTemplateCases() {
  const base = contractData("tests/fixtures/contracts/valid-agent-contract.md", readFileSync("tests/fixtures/contracts/valid-agent-contract.md", "utf8"));
  const minimal = { ...base, text: "", coreFunctions: [], criticalWorkflows: [], memoryModel: "none", skillNeeds: "none", toolSystem: "none", untrustedInputPolicy: "none" };
  return [
    ["legacy", base],
    ["minimal", minimal],
    ["cli", { ...base, runtimeFamily: "cli", primaryInterface: "CLI" }],
    ["api", { ...base, runtimeFamily: "api", primaryInterface: "web", serviceMode: "process" }],
    ["markdown", { ...base, memoryModel: "Markdown", indexingSearchNeeds: "none" }],
    ["sqlite", { ...base, memoryModel: "Markdown SQLite embeddings", indexingSearchNeeds: "SQLite FTS semantic embeddings" }],
    ["external", { ...base, memoryModel: "external vector database", indexingSearchNeeds: "external embeddings" }],
    ["voice-telegram", { ...base, primaryInterface: "web", secondaryInterfaces: "Telegram, CLI, voice", telegramMode: "polling", toolSystem: "read-only web API filesystem", memoryModel: "SQLite embeddings" }],
    ["launchd", { ...base, serviceMode: "launchd", autostart: "launchd-on-approval", startCommand: "node server.mjs", stopCommand: "node stop.mjs", proactiveMode: "scheduled", schedule: "manual review", primaryInterface: "web" }],
    ["repository", { ...base, repositoryAdoptionMode: "selected-module", selectedGitHubRepositories: "https://github.com/example/fixture", selectedRepositoryModule: "module", repositoryPin: "a".repeat(40) }],
    ["escaping", { ...base, agentName: 'Fixture "quote" <xml> $value', mission: "Quotes ` and ${literal} and {{pritha:agentName}}\nnext line", logPath: "logs/", healthcheckCommand: "node scripts/smoke-test.mjs" }],
  ];
}
