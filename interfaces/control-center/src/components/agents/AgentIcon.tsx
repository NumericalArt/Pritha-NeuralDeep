import { Bot, Box, Hexagon, Sailboat, TriangleAlert } from "lucide-react";
import type { AgentIconType } from "@/data/mockAgents";

export function AgentIcon({ type }: { type: AgentIconType }) {
  const icons = {
    bot: Bot,
    sail: Sailboat,
    cube: Hexagon,
    warning: TriangleAlert,
    box: Box,
  };
  const Icon = icons[type];
  return (
    <span className={`agent-icon ${type}`}>
      <Icon size={type === "bot" ? 38 : 34} strokeWidth={type === "warning" ? 1.7 : 1.9} />
    </span>
  );
}
