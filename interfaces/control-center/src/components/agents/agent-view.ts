import type { AgentCardModel } from "@/data/mockAgents";

export function partitionAgentCards(agents: AgentCardModel[]) {
  return {
    // Folder existence never proves that a service is responding.
    active: agents.filter(agent => agent.state !== "missing" && agent.healthStatus === "ok"),
    drafts: agents.filter(agent => agent.state !== "missing" && agent.control?.runtimeKind === "scaffold"),
    history: agents.filter(agent => agent.state === "missing"),
    all: agents,
  };
}
