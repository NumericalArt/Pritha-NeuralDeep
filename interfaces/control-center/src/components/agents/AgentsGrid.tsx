import type { AgentCardModel } from "@/data/mockAgents";
import type { AccessMode } from "@/lib/access-mode";
import type { ControlCenterStatus } from "@/lib/control-center/types";
import { AgentCard } from "./AgentCard";

export function AgentsGrid({
  agents,
  access,
  accessMode,
  onAgentAction,
  onAgentCredentials,
  onCreatePlan,
}: {
  agents: AgentCardModel[];
  access?: ControlCenterStatus["access"];
  accessMode?: AccessMode;
  onAgentAction?: (agent: AgentCardModel) => void;
  onAgentCredentials?: (agent: AgentCardModel) => void;
  onCreatePlan?: () => void;
}) {
  return (
    <div className="agent-grid">
      {agents.map((agent) => (
        <AgentCard agent={agent} access={access} accessMode={accessMode} key={agent.id} onAction={onAgentAction} onCredentials={onAgentCredentials} />
      ))}
      <button className="add-agent-card" type="button" data-testid="create-agent-plan-button" onClick={onCreatePlan} title="Open a safe Task Chat planning handoff">
        <span className="add-symbol">+</span>
        <span>Open in Task Chat / Create Plan</span>
        <small>Contract first</small>
      </button>
    </div>
  );
}
