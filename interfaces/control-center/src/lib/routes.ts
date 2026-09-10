import { Bot, Code2, MessageSquareCode, Mic, Settings } from "lucide-react";

export const desktopNavItems = [
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/voice", label: "Voice", icon: Mic },
  { href: "/task-chat", label: "Task Chat", icon: MessageSquareCode },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/dev", label: "Dev (Read-only)", icon: Code2 },
] as const;

export const mobileNavItems = [
  { href: "/voice", label: "Voice", icon: Mic },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/task-chat", label: "Task Chat", icon: MessageSquareCode },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
