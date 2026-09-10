"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { mobileNavItems } from "@/lib/routes";
import { PrithaLogoPlaceholder } from "@/components/primitives/PrithaLogoPlaceholder";
import { LoaderCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { reportControlCenterUiActivity } from "@/lib/codex-chat/ui-activity-client";

type RouteName = "voice" | "agents" | "task_chat" | "settings" | "other";
function routeName(pathname: string): RouteName {
  if (pathname.startsWith("/voice")) return "voice";
  if (pathname.startsWith("/agents")) return "agents";
  if (pathname.startsWith("/task-chat") || pathname.startsWith("/codex")) return "task_chat";
  if (pathname.startsWith("/settings")) return "settings";
  return "other";
}

function MobileNavContent({ icon: Icon, label }: { icon: typeof LoaderCircle; label: string }) {
  const { pending } = useLinkStatus();
  return <>
    <span className="mobile-nav-icon">{pending ? <LoaderCircle className="spin" size={21} /> : <Icon size={21} />}</span>
    <span>{label}</span>
    {pending ? <span className="sr-only">Loading</span> : null}
  </>;
}

export function MobileShell() {
  const pathname = usePathname();
  const navigationRef = useRef<{ interactionId: string; startedAt: number; href: string; timer: number } | null>(null);

  useEffect(() => {
    const current = navigationRef.current;
    if (!current || !(pathname === current.href || pathname.startsWith(current.href))) return;
    window.clearTimeout(current.timer);
    reportControlCenterUiActivity({ event: "primary_navigation_completed", interactionId: current.interactionId, source: "mobile_bottom_nav", durationMs: Date.now() - current.startedAt, toRoute: routeName(pathname) });
    navigationRef.current = null;
  }, [pathname]);

  useEffect(() => () => {
    if (navigationRef.current) window.clearTimeout(navigationRef.current.timer);
  }, []);

  function beginNavigation(href: string) {
    if (pathname === href || pathname.startsWith(href)) return;
    if (navigationRef.current) window.clearTimeout(navigationRef.current.timer);
    const interactionId = crypto.randomUUID();
    const startedAt = Date.now();
    reportControlCenterUiActivity({ event: "primary_navigation_started", interactionId, source: "mobile_bottom_nav", durationMs: 0, fromRoute: routeName(pathname), toRoute: routeName(href) });
    const timer = window.setTimeout(() => {
      reportControlCenterUiActivity({ event: "primary_navigation_timeout", interactionId, source: "mobile_bottom_nav", durationMs: 15_000, fromRoute: routeName(pathname), toRoute: routeName(href), errorCode: "navigation_timeout" });
      if (navigationRef.current?.interactionId === interactionId) navigationRef.current = null;
    }, 15_000);
    navigationRef.current = { interactionId, startedAt, href, timer };
  }

  return (
    <div className="mobile-shell">
      <header className="mobile-header">
        <Link href="/voice" className="mobile-brand">
          <PrithaLogoPlaceholder size={46} />
          <span>
            <span className="mobile-brand-title">Pritha</span>
            <span className="mobile-brand-subtitle">Control Center</span>
          </span>
        </Link>
      </header>
      <nav className="mobile-bottom-nav" aria-label="Mobile primary">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href);
          return (
            <Link href={item.href} onClick={() => beginNavigation(item.href)} aria-current={active ? "page" : undefined} className={`mobile-nav-item ${active ? "active" : ""}`} key={item.href}>
              <MobileNavContent icon={Icon} label={item.label} />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
