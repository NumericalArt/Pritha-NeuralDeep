// Lifecycle artifacts stay in instance-local memory. Promotion and publication
// must agree on the same policy, including artifacts without subject metadata.
export const CHILD_AGENT_TYPES = new Set([
  "agent-contract",
  "agent-outcome-spec",
  "scaffold-report",
  "agent-delivery-report",
  "agent-test-report",
  "agent-handoff-report",
  "agent-operations-report",
  "agent-deployment-report",
  "agent-post-creation-review",
  "agent-registry",
  "child-agent-profile",
]);
