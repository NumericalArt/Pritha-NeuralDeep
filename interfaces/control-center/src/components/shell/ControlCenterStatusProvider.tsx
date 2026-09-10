"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ControlCenterStatus } from "@/lib/control-center/types";

type StatusContextValue = {
  status: ControlCenterStatus;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<ControlCenterStatus>;
};

const StatusContext = createContext<StatusContextValue | null>(null);

export function ControlCenterStatusProvider({ initialStatus, children }: { initialStatus: ControlCenterStatus; children: React.ReactNode }) {
  const [status, setStatus] = useState(initialStatus);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<Promise<ControlCenterStatus> | null>(null);

  const refresh = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    setRefreshing(true);
    const request = fetch("/api/status", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("status_unavailable");
        return response.json() as Promise<ControlCenterStatus>;
      })
      .then((next) => {
        setStatus(next);
        setError(null);
        return next;
      })
      .catch((cause) => {
        setError("Control Center status could not refresh.");
        throw cause;
      })
      .finally(() => {
        inFlight.current = null;
        setRefreshing(false);
      });
    inFlight.current = request;
    return request;
  }, []);

  useEffect(() => {
    // The server-rendered shell may contain a build-time snapshot.
    void refresh().catch(() => undefined);
    const onFocus = () => void refresh().catch(() => undefined);
    const onOnline = () => void refresh().catch(() => undefined);
    const onRequestedRefresh = () => void refresh().catch(() => undefined);
    const onVisibility = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("pritha:status-refresh", onRequestedRefresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pritha:status-refresh", onRequestedRefresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const value = useMemo(() => ({ status, refreshing, error, refresh }), [error, refresh, refreshing, status]);
  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}

export function useControlCenterStatus() {
  const value = useContext(StatusContext);
  if (!value) throw new Error("useControlCenterStatus must be used inside ControlCenterStatusProvider");
  return value;
}
