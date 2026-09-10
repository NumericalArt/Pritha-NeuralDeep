import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const agentsOperatorSource = readFileSync("interfaces/control-center/src/components/agents/AgentsOperatorExperience.tsx", "utf8");
const mobileAgentsSource = readFileSync("interfaces/control-center/src/components/agents/MobileAgents.tsx", "utf8");
const agentCardSource = readFileSync("interfaces/control-center/src/components/agents/AgentCard.tsx", "utf8");
const globalCssSource = readFileSync("interfaces/control-center/src/styles/globals.css", "utf8");
const serverSource = readFileSync("interfaces/control-center/src/lib/control-center/server.ts", "utf8");

test("Agents runtime actions require an exact typed confirmation before execution", () => {
  assert.doesNotMatch(agentsOperatorSource, /window\.confirm/);
  assert.match(agentsOperatorSource, /const \[confirmationInput, setConfirmationInput\] = useState\(""\)/);
  assert.match(agentsOperatorSource, /const needsConfirmation = plan\.requiresConfirmation === true/);
  assert.match(agentsOperatorSource, /needsConfirmation && confirmationInput !== requiredPhrase/);
  assert.match(agentsOperatorSource, /body: JSON\.stringify\(\{ confirmation: needsConfirmation \? confirmationInput : "" \}\)/);
  assert.match(agentsOperatorSource, /confirmationInput === requiredPhrase/);
  assert.match(agentsOperatorSource, /Manual Confirmation/);
  assert.match(agentsOperatorSource, /Required phrase/);
  assert.match(agentsOperatorSource, /value=\{confirmationInput\}/);
});

test("Agents runtime backend still requires the exact confirmation phrase", () => {
  assert.match(serverSource, /confirmation\.trim\(\) !== requiredPhrase/);
  assert.match(serverSource, /Confirmation phrase mismatch/);
});

test("Agents runtime backend uses explicit Start/Stop plan statuses", () => {
  const start = serverSource.indexOf("function buildOperatorActionPlan");
  const end = serverSource.indexOf("export async function getAgentOperatorActionPlan", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const planBuilder = serverSource.slice(start, end);

  assert.match(planBuilder, /\? "needs_confirmation"\s*:\s*"ready"/);
  assert.match(planBuilder, /unavailableBlockers\.length > 0\s*\?\s*"unavailable"/);
  assert.match(planBuilder, /\?\s*"plan_only"\s*:\s*"blocked"/);
  assert.match(planBuilder, /action === "check"\s*\?\s*"manual_only"/);
  assert.doesNotMatch(planBuilder, /startStopEnabled[\s\S]{0,140}\?\s*"manual_only"/);
  assert.doesNotMatch(planBuilder, /startStopEnabled[\s\S]{0,140}\?\s*"planned"/);
});

test("Agents runtime backend exposes mandatory lifecycle readiness checks", () => {
  assert.match(serverSource, /function operationalReadiness/);
  assert.match(serverSource, /service_install_required/);
  assert.match(serverSource, /LaunchAgent plist is missing/);
  assert.match(serverSource, /unmanaged_local/);
  assert.match(serverSource, /Unmanaged local process/);
  assert.match(serverSource, /fallback_stop_process/);
  assert.match(serverSource, /Tailscale route pending/);
  assert.match(serverSource, /Local runtime is ready; Tailscale route is pending/);
  assert.match(serverSource, /\.\.\.agent\.readiness\.checks/);
  assert.match(serverSource, /readiness\.status === "service_install_required"/);
  assert.match(serverSource, /label: "Service Required"/);
  assert.match(serverSource, /readinessIssueText\(readiness\) \|\| issueText/);
});

test("Agent status page renders operational readiness rows", () => {
  const statusPageSource = readFileSync("interfaces/control-center/src/app/agents/[id]/page.tsx", "utf8");
  assert.match(statusPageSource, /\["Readiness", agent\.readiness\.status, agent\.readiness\.summary\]/);
  assert.match(statusPageSource, /\["Runtime service", agent\.readiness\.runtime\.status, agent\.readiness\.runtime\.detail\]/);
  assert.match(statusPageSource, /\["Access", agent\.readiness\.access\.tailscale, agent\.readiness\.access\.detail\]/);
});

test("Mobile Agents mirrors desktop filtering and uses readable fleet audit summary", () => {
  assert.match(agentsOperatorSource, /agents=\{visibleAgents\}/);
  assert.match(agentsOperatorSource, /agentView=\{agentView\}/);
  assert.match(agentsOperatorSource, /onAgentViewChange=\{setAgentView\}/);
  assert.match(mobileAgentsSource, /type AgentView = "active" \| "drafts" \| "all"/);
  assert.match(mobileAgentsSource, /Fleet: \$\{result\.summary\.passed\} ok · \$\{result\.summary\.warnings\} warn · \$\{result\.summary\.failed\} failed/);
  assert.match(mobileAgentsSource, /Active\s*<\/button>/);
  assert.match(mobileAgentsSource, /Drafts\s*<\/button>/);
  assert.match(mobileAgentsSource, /All\s*<\/button>/);
  assert.match(globalCssSource, /\.mobile-agent-view-toggle/);
});

test("Mobile agent cards do not render unused menu dots", () => {
  assert.doesNotMatch(agentCardSource, /agent-menu-button/);
  assert.doesNotMatch(agentCardSource, /Open menu for/);
  assert.doesNotMatch(globalCssSource, /\.agent-menu-button/);
});
