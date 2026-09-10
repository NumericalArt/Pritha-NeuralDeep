"use client";
import { SearchSettingsSection } from "./SearchSettingsSection";

import {
  Check,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  Globe2,
  Home,
  Info,
  Laptop,
  Monitor,
  Moon,
  Play,
  QrCode,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sun,
  Terminal,
  TimerReset,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { selectTheme, useControlCenterTheme } from "@/components/shell/ThemeSync";
import type { ControlCenterTheme } from "@/lib/theme";
import { PageHeader } from "@/components/shell/PageHeader";
import { CodexSettingsSection } from "@/components/settings/CodexSettingsSection";
import { EmbeddingsSettingsSection } from "@/components/settings/EmbeddingsSettingsSection";
import { LimitsSettingsSection } from "@/components/settings/LimitsSettingsSection";
import { MusicSettingsSection } from "@/components/settings/MusicSettingsSection";
import { OpenAIKeysSection } from "@/components/settings/OpenAIKeysSection";
import { NeuralDeepKeysSection } from "@/components/settings/NeuralDeepKeysSection";
import { LanguageDropdown } from "@/components/primitives/LanguageDropdown";
import { VoiceSettingsSection } from "@/components/settings/VoiceSettingsSection";
import type { CapabilityStatus, ControlCenterStatus } from "@/lib/control-center/types";
import {
  type AccessMode,
  accessModeReady,
  accessVoiceUrl,
  preferredAccessMode,
  readStoredAccessMode,
  writeStoredAccessMode,
} from "@/lib/access-mode";

function statusText(status: CapabilityStatus) {
  return status.replace(/_/g, " ");
}

function formatUptime(seconds: number | undefined) {
  if (seconds == null || seconds < 0) return "starting";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function capabilityTone(status: CapabilityStatus | "pass" | "fail" | "unknown") {
  if (status === "ready" || status === "pass") return "good";
  return "";
}

const THEME_OPTIONS: Array<{
  id: ControlCenterTheme;
  label: string;
  detail: string;
  icon: typeof Moon;
}> = [
  { id: "dark", label: "Dark", detail: "Graphite · default theme", icon: Moon },
  { id: "light", label: "Light", detail: "Mineral green & slate", icon: Sun },
  { id: "classic", label: "Classic", detail: "Original Pritha · violet & cyan", icon: Monitor },
];

function memoryIndexLabel(status?: ControlCenterStatus) {
  const stats = status?.selfTest.memoryStats;
  if (!stats?.documents && !stats?.chunks) return "Unknown";
  return `${stats.documents.toLocaleString("en-US")} docs / ${stats.chunks.toLocaleString("en-US")} chunks`;
}

function metricLabel(value: number | undefined) {
  return Number(value || 0).toLocaleString("en-US");
}

type MaintenanceGithubStatus = {
  status: string;
  updateNeeded: boolean;
  safeToUpdate: boolean;
  branch: string;
  ahead: number;
  behind: number;
  checks?: MaintenanceCheck[];
  curatedUntracked?: string[];
};

type MaintenanceRadarStatus = {
  status: string;
  candidates: number;
  registryPath?: string;
};

type MaintenanceCheck = {
  id: string;
  status: string;
  detail: string;
  required?: boolean;
};

type MaintenanceStatus = {
  schema: string;
  status?: string;
  ok?: boolean;
  action?: string;
  result?: string;
  artifactPath?: string;
  records?: number;
  backupBranch?: string;
  candidates?: unknown[] | number;
  checks?: MaintenanceCheck[];
  plannedQueries?: string[];
  steps?: string[];
  localStatus?: string;
  blockedReason?: string;
  error?: string;
  updateNeeded?: boolean;
  safeToUpdate?: boolean;
  branch?: string;
  ahead?: number;
  behind?: number;
  curatedUntracked?: string[];
  github?: MaintenanceGithubStatus;
  radar?: MaintenanceRadarStatus;
  cronAdapter?: {
    status: CapabilityStatus | string;
    mode: string;
  };
  api?: {
    ok: boolean;
    exitCode: number;
    stderr?: string;
  };
};

type SettingsSectionId = "general" | "access" | "codex" | "voice" | "music" | "limits" | "maintenance" | "proactivity";

const SETTINGS_SECTIONS: Array<{ id: SettingsSectionId; label: string }> = [
  { id: "general", label: "General" },
  { id: "access", label: "Access" },
  { id: "codex", label: "Codex" },
  { id: "voice", label: "Voice" },
  { id: "music", label: "Music" },
  { id: "limits", label: "Usage & Billing" },
  { id: "maintenance", label: "Maintenance" },
  { id: "proactivity", label: "Proactivity" },
];

function useSettingsAnchors(prefix: string) {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("general");

  useEffect(() => {
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;
    const elements = SETTINGS_SECTIONS.map((section) => document.getElementById(`${prefix}-${section.id}`)).filter((element): element is HTMLElement => Boolean(element));
    if (!elements.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0];
        const section = visible?.target.getAttribute("data-settings-section") as SettingsSectionId | null;
        if (section) setActiveSection(section);
      },
      { rootMargin: "-18% 0px -62% 0px", threshold: [0.1, 0.35, 0.6] },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [prefix]);

  const scrollToSection = useCallback(
    (section: SettingsSectionId) => {
      setActiveSection(section);
      document.getElementById(`${prefix}-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [prefix],
  );

  return { activeSection, scrollToSection };
}

function SettingsTabs({ activeSection, onSelect, controlsPrefix }: { activeSection: SettingsSectionId; onSelect: (section: SettingsSectionId) => void; controlsPrefix: string }) {
  return (
    <div className="settings-tabs" role="tablist" aria-label="Settings sections">
      {SETTINGS_SECTIONS.map((section) => (
        <button
          className={`settings-tab ${section.id === activeSection ? "active" : ""}`}
          type="button"
          role="tab"
          aria-selected={section.id === activeSection}
          aria-controls={`${controlsPrefix}-${section.id}`}
          onClick={() => onSelect(section.id)}
          key={section.id}
        >
          {section.label}
        </button>
      ))}
    </div>
  );
}

function SettingsAnchorSection({ prefix, section, children }: { prefix: string; section: SettingsSectionId; children: React.ReactNode }) {
  return (
    <div id={`${prefix}-${section}`} className="settings-anchor-target settings-section-stack" data-settings-section={section}>
      {children}
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="section-header">
      <span className="section-icon">{icon}</span>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function LanguageSection({ id = "settings-language" }: { id?: string }) {
  return (
    <section className="settings-section">
      <div className="settings-section-row">
        <SectionHeader icon={<Globe2 size={22} />} title="Language" subtitle="Interface language" />
        <label className="settings-select-label">
          <span>Default</span>
          <LanguageDropdown id={id} ariaLabel="Default interface language" />
        </label>
      </div>
      <div className="info-note">
        <Info size={17} />
        Pritha's core knowledge and project files remain in English.
      </div>
    </section>
  );
}

type AccessProps = {
  access?: ControlCenterStatus["access"];
  status?: ControlCenterStatus;
};

function VoiceLinkModal({ mode, url, onClose }: { mode: AccessMode; url?: string; onClose: () => void }) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl("");
    setError("");
    if (!url) return;
    QRCode.toDataURL(url, { width: 240, margin: 2, color: { dark: "#111827", light: "#ffffff" } })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setError("QR code unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const localOnly = mode === "localhost";
  const connectionNote = localOnly
    ? "Localhost works only on this Mac. On a phone, 127.0.0.1 means the phone itself. Use Tailscale Serve for phone access."
    : mode === "lan"
      ? "LAN access is disabled by policy. Control Center stays on 127.0.0.1; use Tailscale Serve for trusted devices."
      : "Tailscale opens this only to trusted devices in the same tailnet. Peer access is accepted after opening this URL from the phone.";
  return (
    <div className="access-modal-overlay" role="presentation" onMouseDown={(event) => (event.target === event.currentTarget ? onClose() : undefined)}>
      <div className="access-modal voice-link-modal" role="dialog" aria-modal="true" aria-label="Voice link QR code">
        <div className="access-modal-header">
          <h2>Voice Link</h2>
          <button className="icon-button" type="button" aria-label="Close voice link" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="voice-link-qr-frame">
          {qrDataUrl ? <img src={qrDataUrl} alt="QR code for Voice Link" /> : <span>{error || "Generating QR..."}</span>}
        </div>
        <p>{url || "Voice URL unavailable"}</p>
        <div className={`voice-link-note ${localOnly ? "warn" : ""}`}>
          {connectionNote}
        </div>
      </div>
    </div>
  );
}

function accessStatusLabel(access: ControlCenterStatus["access"] | undefined, mode: AccessMode) {
  if (!access) return "Loading";
  if (mode === "localhost") return "Mac only";
  if (mode === "lan") return access.lan === "ready" ? "Ready" : "Disabled";
  if (access.tailscale === "ready") return "Serve ready";
  if (access.tailscale === "pending_auth") return "Needs Serve";
  return "Not configured";
}

function TailscaleSetupPanel({ access }: { access?: ControlCenterStatus["access"] }) {
  const statusLabel = access?.tailscale === "ready" ? "Ready" : access?.tailscale === "pending_auth" ? "Needs Serve" : "Not configured";
  let controlCenterPort = "3420";
  try {
    controlCenterPort = new URL(access?.localhost || "http://127.0.0.1:3420").port || "3420";
  } catch {
    // Keep the neutral default in setup guidance until status has loaded.
  }
  return (
    <div className="settings-setup-panel">
      <div className="settings-setup-header">
        <div>
          <strong>Tailscale private access</strong>
          <span>{statusLabel}. Localhost stays private; Tailscale Serve forwards trusted tailnet devices to this local Control Center.</span>
        </div>
        <span className={`settings-status-chip ${access?.tailscale === "ready" ? "alive" : "unknown"}`}>{statusLabel}</span>
      </div>
      <div className="settings-command-grid">
        <div className="settings-command-row">
          <Terminal size={16} />
          <code>{`node scripts/tailscale-setup.mjs plan --app control-center --port ${controlCenterPort}`}</code>
        </div>
        <div className="settings-command-row">
          <Terminal size={16} />
          <code>node scripts/tailscale-setup.mjs status --json</code>
        </div>
        <div className="settings-command-row">
          <Terminal size={16} />
          <code>node scripts/tailscale-setup.mjs auth-status</code>
        </div>
      </div>
      <div className="info-note">
        <Info size={17} />
        Mutating actions require explicit operator approval: install --yes, serve --yes, off --yes, tailscale up, auth keys, Funnel and service changes.
      </div>
      <div className="settings-action-row">
        <a className="outline-button compact" href="https://tailscale.com/docs/install/mac" target="_blank" rel="noreferrer">
          <ExternalLink size={15} />
          macOS install
        </a>
        <a className="outline-button compact" href="https://tailscale.com/docs/features/tailscale-serve" target="_blank" rel="noreferrer">
          <ExternalLink size={15} />
          Serve docs
        </a>
      </div>
    </div>
  );
}

function AccessSection({ access }: AccessProps) {
  const [selectedMode, setSelectedMode] = useState<AccessMode>(() => (access ? preferredAccessMode(access) : "localhost"));
  const [voiceLinkOpen, setVoiceLinkOpen] = useState(false);

  useEffect(() => {
    if (!access) return;
    setSelectedMode(preferredAccessMode(access, readStoredAccessMode()));
  }, [access]);

  function chooseMode(mode: AccessMode) {
    if (!access || !accessModeReady(access, mode)) return;
    setSelectedMode(mode);
    writeStoredAccessMode(mode);
  }

  const voiceMode = access && accessModeReady(access, "tailscale") ? "tailscale" : selectedMode;
  const voiceUrl = access ? accessVoiceUrl(access, voiceMode) : undefined;
  const options = [
    {
      id: "localhost" as const,
      label: "Localhost",
      value: access?.localhost || "http://127.0.0.1:3420",
      detail: "Works only on this Mac.",
      icon: Laptop,
    },
    {
      id: "lan" as const,
      label: "LAN",
      value: "Disabled by policy",
      detail: access?.lanReason || "LAN binding is disabled by policy. Use Tailscale Serve.",
      icon: Home,
    },
    {
      id: "tailscale" as const,
      label: "Tailscale",
      value: access?.tailscaleUrl || "Not configured",
      detail: access?.tailscaleServeConfigured ? "Private Serve is configured." : "Install, authenticate, then approve Serve.",
      icon: ShieldCheck,
    },
  ].map((option) => ({ ...option, ready: access ? accessModeReady(access, option.id) : false }));

  return (
    <section className="settings-section">
      <SectionHeader icon={<SlidersHorizontal size={22} />} title="Access & Connections" subtitle="How devices connect to Pritha Control Center" />
      <div className="access-grid">
        {options.map((option) => {
          const Icon = option.icon;
          const selected = option.id === selectedMode && option.ready;
          return (
            <button
              className={`access-option ${selected ? "selected" : ""} ${option.ready ? "ready" : "unavailable"}`}
              type="button"
              aria-pressed={selected}
              disabled={!option.ready}
              onClick={() => chooseMode(option.id)}
              key={option.id}
            >
              <Icon size={25} />
              <strong>{option.label}</strong>
              <small>{accessStatusLabel(access, option.id)}</small>
              <span>{option.value}</span>
              <em>{option.detail}</em>
              {option.ready ? (
                <span className="ready-check ready" aria-label={`${option.label} connection ready`}>
                  <CheckCircle2 size={18} />
                </span>
              ) : null}
            </button>
          );
        })}
        <button className={`access-option voice-link-action ${voiceUrl ? "ready" : "unavailable"}`} type="button" onClick={() => setVoiceLinkOpen(true)} disabled={!voiceUrl}>
          {voiceMode === "localhost" ? <Smartphone size={25} /> : <QrCode size={25} />}
          <strong>Voice Link</strong>
          <small>{voiceMode === "localhost" ? "Mac only" : "Phone ready"}</small>
          <span>{voiceUrl ? (voiceMode === "localhost" ? "Open /voice on this Mac" : "Open /voice on phone") : "Select an available connection"}</span>
        </button>
      </div>
      <div className="info-note">
        <Info size={17} />
        Localhost QR codes do not work from a phone. LAN binding is disabled by policy; Tailscale is the private phone path.
      </div>
      <TailscaleSetupPanel access={access} />
      {voiceLinkOpen ? <VoiceLinkModal mode={voiceMode} url={voiceUrl} onClose={() => setVoiceLinkOpen(false)} /> : null}
    </section>
  );
}

function AppearanceSection() {
  const themePreference = useControlCenterTheme();
  const activeOption = THEME_OPTIONS.find((option) => option.id === themePreference) || THEME_OPTIONS[0];

  return (
    <section className="settings-section appearance-section">
      <div className="appearance-header-row">
        <SectionHeader icon={<Moon size={23} />} title="Appearance" subtitle="Theme" />
        <span className="appearance-applied" aria-live="polite">
          Applied: {activeOption.label}
        </span>
      </div>
      <div className="theme-toggle" role="radiogroup" aria-label="Theme">
        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = option.id === themePreference;
          return (
            <button
              className={selected ? "active" : ""}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTheme(option.id)}
              onKeyDown={(event) => {
                const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
                if (!delta && event.key !== "Home" && event.key !== "End") return;
                event.preventDefault();
                const index = event.key === "Home" ? 0 : event.key === "End" ? THEME_OPTIONS.length - 1 : (THEME_OPTIONS.indexOf(option) + delta + THEME_OPTIONS.length) % THEME_OPTIONS.length;
                selectTheme(THEME_OPTIONS[index].id);
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
              }}
              key={option.id}
            >
              <Icon size={16} />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
      <div className={`theme-preview theme-preview-${themePreference}`}>
        <div className="theme-preview-window" aria-hidden="true">
          <span className="theme-preview-sidebar" />
          <span className="theme-preview-main">
            <span className="theme-preview-bar" />
            <span className="theme-preview-row strong" />
            <span className="theme-preview-row" />
            <span className="theme-preview-row short" />
          </span>
        </div>
        <div>
          <strong>{activeOption.detail}</strong>
          <span>{`${activeOption.label} theme is active across Neural Deep.`}</span>
        </div>
        <Check size={18} />
      </div>
    </section>
  );
}

function DataStorageSection({ status }: { status?: ControlCenterStatus }) {
  const stats = status?.selfTest.memoryStats;
  return (
    <section className="settings-section">
      <SectionHeader icon={<Database size={23} />} title="Data & Storage" subtitle="Snapshots and local data" />
      <div className="settings-rowline settings-memory-row">
        <div>
          <strong>Pritha memory snapshot</strong>
          <span>Portable authored memory plus rebuildable SQLite/vector cache committed for fresh-clone usability.</span>
        </div>
        <div className="settings-mini-metrics" aria-label="Pritha memory snapshot">
          <span>{metricLabel(stats?.documents)} docs</span>
          <span>{metricLabel(stats?.chunks)} chunks</span>
          <span>{metricLabel(stats?.entities)} entities</span>
          <span>{metricLabel(stats?.relations)} relations</span>
          <span>{metricLabel(stats?.embeddings)} embeddings</span>
        </div>
      </div>
      <div className="settings-rowline">
        <div>
          <strong>Snapshots retention per agent</strong>
          <span>How many snapshots to keep for rollback</span>
        </div>
        <select defaultValue="2" aria-label="Snapshots retention per agent">
          <option value="1">1 snapshot</option>
          <option value="2">2 snapshots (recommended)</option>
          <option value="3">3 snapshots</option>
        </select>
      </div>
      <div className="settings-rowline">
        <div>
          <strong>Clear local cache</strong>
          <span>Safe to clear. Does not remove snapshots or reports.</span>
        </div>
        <button className="outline-button" type="button" disabled>
          Clear Cache
        </button>
      </div>
    </section>
  );
}

function SummaryCard({ status }: { status?: ControlCenterStatus }) {
  const selfTest = status?.selfTest;
  return (
    <section className="side-card summary-card">
      <h2>Pritha Summary</h2>
      <dl className="summary-list">
        <div>
          <dt>
            <ShieldCheck size={16} />
            Version
          </dt>
          <dd>{status?.app.version || "v?"}</dd>
        </div>
        <div>
          <dt>
            <Info size={16} />
            Status
          </dt>
          <dd className={capabilityTone(status?.pritha.status || "unknown")}>{status?.pritha.status === "ready" ? "Ready" : "Needs setup"}</dd>
        </div>
        <div>
          <dt>
            <Clock3 size={16} />
            Uptime
          </dt>
          <dd>{formatUptime(status?.app.uptimeSeconds)}</dd>
        </div>
        <div>
          <dt>
            <Database size={16} />
            Memory Index
          </dt>
          <dd>{memoryIndexLabel(status)}</dd>
        </div>
        <div>
          <dt>
            <TimerReset size={16} />
            Last Self-test
          </dt>
          <dd className={capabilityTone(selfTest?.status || "unknown")} title={selfTest?.createdAt}>
            {selfTest?.ageLabel || "Never"}
          </dd>
        </div>
      </dl>
      <button className="outline-button full" type="button" aria-disabled="true" title="Run from CLI: node scripts/self-test.mjs">
        <Play size={16} />
        Self-test is CLI-only
      </button>
    </section>
  );
}

function LimitsCard({ status }: { status?: ControlCenterStatus }) {
  return (
    <section className="side-card limits-card">
      <h2>Capability Overview</h2>
      <div className="limit-row">
        <span>Codex Bridge <Info size={14} /></span>
        <strong>{status ? statusText(status.voice.codexBridge) : "unknown"}</strong>
      </div>
      <div className="limit-row">
        <span>OpenAI Realtime <Info size={14} /></span>
        <strong>{status ? statusText(status.voice.realtime) : "unknown"}</strong>
      </div>
      <div className="limit-row budget">
        <span>Budget <Info size={14} /></span>
        <strong>Manual / unavailable</strong>
      </div>
      <button className="outline-button full" type="button">
        Open Limits Settings
      </button>
    </section>
  );
}

function maintenanceStatusLabel(value?: MaintenanceStatus | null) {
  if (!value) return "Loading";
  const github = value.github;
  if (!github) return value.status || "unknown";
  if (github.safeToUpdate) return "Update ready";
  if (github.status === "up_to_date") return "Up to date";
  return github.status.replace(/_/g, " ");
}

function maintenanceResultText(value?: MaintenanceStatus | null) {
  if (!value) return "";
  if (value.artifactPath) return `Created ${value.artifactPath}`;
  if (value.records != null) return `Registry refreshed: ${value.records} records`;
  if (value.backupBranch) return `Updated with backup ${value.backupBranch}`;
  if (value.result) return value.result;
  if (Array.isArray(value.candidates)) return `Candidates found: ${value.candidates.length}`;
  if (typeof value.candidates === "number") return `Candidates: ${value.candidates}`;
  return `${value.action || value.schema}: ${value.status || (value.ok ? "ok" : "failed")}`;
}

const GITHUB_BLOCKING_LABELS: Record<string, string> = {
  "main-branch": "current branch is not main",
  "tracked-working-tree-clean": "working tree has local edits",
  "origin-remote": "origin remote is unavailable",
  "origin-fetch": "origin fetch failed",
  "local-main": "local main is unavailable",
  "origin-main": "origin/main is unavailable",
  "ahead-behind": "ahead/behind check failed",
  "local-commits-preserved": "local main has commits ahead of origin/main",
  "fast-forward-only": "update is not fast-forward-only",
};

const MAINTENANCE_ACTION_LABELS: Record<string, string> = {
  "github-check": "GitHub check",
  "github-update": "GitHub update",
  "rebuild-from-github": "Rebuild plan",
  "refresh-agents": "Child agent refresh",
  "refresh-self-knowledge": "Self knowledge refresh",
  "github-knowledge-radar": "Knowledge Radar status",
  "github-knowledge-radar-search": "Knowledge Radar search",
};

function maintenanceActionLabel(action?: string | null) {
  if (!action) return "Maintenance action";
  return MAINTENANCE_ACTION_LABELS[action] || action.replace(/-/g, " ");
}

function failedMaintenanceChecks(value?: MaintenanceStatus | null) {
  if (value?.action === "rebuild-from-github") return [];
  const checks = [...(value?.checks || []), ...(value?.github?.checks || [])];
  return checks.filter((check) => check.status === "fail" || (check.required && check.status !== "pass"));
}

function githubBlockingSummary(github?: MaintenanceGithubStatus) {
  if (!github || github.safeToUpdate) return "";
  const failed = failedMaintenanceChecks({ schema: "github-check", github }).map((check) => GITHUB_BLOCKING_LABELS[check.id] || check.id.replace(/-/g, " "));
  if (failed.length) return `Blocked: ${failed.slice(0, 3).join("; ")}.`;
  if (!github.updateNeeded) return "No update is available.";
  return "Update is not safe to apply yet.";
}

function githubFromMaintenanceResult(value?: MaintenanceStatus | null): MaintenanceGithubStatus | undefined {
  if (!value) return undefined;
  if (value.github) return value.github;
  if (value.branch && typeof value.ahead === "number" && typeof value.behind === "number") {
    return {
      status: value.status || "unknown",
      updateNeeded: Boolean(value.updateNeeded),
      safeToUpdate: Boolean(value.safeToUpdate),
      branch: value.branch,
      ahead: value.ahead,
      behind: value.behind,
      checks: value.checks,
      curatedUntracked: value.curatedUntracked,
    };
  }
  return undefined;
}

function maintenanceResultTone(value?: MaintenanceStatus | null, busyAction?: string | null) {
  if (busyAction) return "blue";
  if (!value) return "";
  if (value.api?.ok === false || value.ok === false || value.status === "failed") return "red";
  if (value.status === "blocked" || value.status === "plan_only" || value.status === "planned") return "orange";
  return "green";
}

function maintenanceResultTitle(value?: MaintenanceStatus | null, busyAction?: string | null) {
  if (busyAction) return `${maintenanceActionLabel(busyAction)} is running`;
  if (!value) return "No action result yet";
  if (value.action === "github-check" && value.status === "blocked") return "GitHub update is blocked";
  if (value.action === "refresh-agents" && value.status === "updated") return "Agent registry refreshed";
  if (value.status === "blocked") return `${maintenanceActionLabel(value.action)} is blocked`;
  if (value.status === "plan_only") return "Plan generated";
  if (value.status === "planned") return "Search prepared";
  if (value.status === "created") return "Draft created";
  if (value.status === "updated") return "Update applied";
  if (value.status === "up_to_date") return "Already up to date";
  if (value.status === "failed") return "Action failed";
  return maintenanceActionLabel(value.action);
}

function maintenanceResultDetail(value?: MaintenanceStatus | null) {
  if (!value) return "";
  if (value.action === "rebuild-from-github") return "Rebuild plan generated. No files were changed.";
  if (value.action === "github-knowledge-radar") return value.radar ? `Registry status: ${value.radar.status}; ${value.radar.candidates} registered candidates.` : "Knowledge Radar status loaded.";
  if (value.blockedReason) return value.blockedReason;
  if (value.error) return value.error;
  if (value.artifactPath) return `Draft artifact: ${value.artifactPath}`;
  if (value.records != null) return `Agent registry rebuilt with ${value.records} records.`;
  if (value.backupBranch) return `Backup branch: ${value.backupBranch}`;
  if (value.schema === "pritha-github-update-check-v1" || value.github) {
    const github = githubFromMaintenanceResult(value);
    if (github) {
      return `${github.status.replace(/_/g, " ")} on ${github.branch}; behind ${github.behind}, ahead ${github.ahead}. ${githubBlockingSummary(github)}`.trim();
    }
  }
  if (value.plannedQueries?.length) return `Prepared ${value.plannedQueries.length} GitHub query candidates. Online search is disabled in the UI safety mode.`;
  if (typeof value.candidates === "number") return `Registered candidates: ${value.candidates}.`;
  if (Array.isArray(value.candidates)) return `Search candidates: ${value.candidates.length}.`;
  return maintenanceResultText(value);
}

function compactMaintenanceCheckDetail(check: MaintenanceCheck) {
  if (check.id === "tracked-working-tree-clean") {
    const lines = check.detail.split(/\r?\n/).filter(Boolean);
    if (lines.length > 1) return `${lines.length} tracked files have local edits.`;
    if (check.detail.length > 90) return "Tracked working tree has local edits.";
  }
  if (check.detail.length > 180) return `${check.detail.slice(0, 177)}...`;
  return check.detail;
}

function MaintenanceFeedbackPanel({ result, busyAction }: { result?: MaintenanceStatus | null; busyAction?: string | null }) {
  if (!result && !busyAction) return null;
  const tone = maintenanceResultTone(result, busyAction);
  const checks = failedMaintenanceChecks(result);
  return (
    <div className={`maintenance-feedback ${tone}`} role="status" aria-live="polite">
      <div>
        <strong>{maintenanceResultTitle(result, busyAction)}</strong>
        <span>{busyAction ? "Waiting for backend response..." : maintenanceResultDetail(result)}</span>
      </div>
      {!busyAction && (checks.length || result?.plannedQueries?.length || result?.steps?.length || result?.localStatus || result?.api?.stderr) ? (
        <details>
          <summary>Details</summary>
          {checks.length ? (
            <ul>
              {checks.slice(0, 8).map((check) => (
                <li key={`${check.id}-${check.detail}`}>
                  <code>{GITHUB_BLOCKING_LABELS[check.id] || check.id}</code>: {compactMaintenanceCheckDetail(check)}
                </li>
              ))}
            </ul>
          ) : null}
          {result?.plannedQueries?.length ? (
            <ul>
              {result.plannedQueries.map((query) => (
                <li key={query}>{query}</li>
              ))}
            </ul>
          ) : null}
          {result?.steps?.length ? (
            <ol>
              {result.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : null}
          {result?.api?.stderr ? <code>{result.api.stderr}</code> : null}
        </details>
      ) : null}
    </div>
  );
}

type MaintenanceFeedbackGroup = "github" | "rebuild" | "agents" | "self" | "radar";

function maintenanceFeedbackGroup(action?: string | null): MaintenanceFeedbackGroup | null {
  if (!action) return null;
  if (action === "github-check" || action === "github-update" || action === "github-update-plan") return "github";
  if (action === "rebuild-from-github") return "rebuild";
  if (action === "refresh-agents") return "agents";
  if (action === "refresh-self-knowledge") return "self";
  if (action === "github-knowledge-radar" || action === "github-knowledge-radar-search") return "radar";
  return null;
}

function MaintenanceGroupFeedback({
  group,
  result,
  busyAction,
}: {
  group: MaintenanceFeedbackGroup;
  result?: MaintenanceStatus | null;
  busyAction?: string | null;
}) {
  const busyMatches = maintenanceFeedbackGroup(busyAction) === group;
  const resultMatches = !busyAction && maintenanceFeedbackGroup(result?.action) === group;
  if (!busyMatches && !resultMatches) return null;
  return <MaintenanceFeedbackPanel result={resultMatches ? result : null} busyAction={busyMatches ? busyAction : null} />;
}

function MaintenanceSettingsSection() {
  const [maintenance, setMaintenance] = useState<MaintenanceStatus | null>(null);
  const [lastResult, setLastResult] = useState<MaintenanceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const loadMaintenance = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/maintenance", { cache: "no-store" });
      const payload = (await response.json()) as MaintenanceStatus;
      setMaintenance(payload);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMaintenance();
  }, [loadMaintenance]);

  const runAction = useCallback(
    async (action: string) => {
      if (action === "github-update") {
        const accepted = window.confirm("Apply a fast-forward GitHub update to local Pritha now?");
        if (!accepted) return;
      }
      setBusyAction(action);
      try {
        setLastResult(null);
        const response = await fetch(`/api/maintenance/${action}`, { method: "POST" });
        const payload = (await response.json()) as MaintenanceStatus;
        if (!payload.action) payload.action = action;
        setLastResult(payload);
        await loadMaintenance();
        window.dispatchEvent(new Event("pritha:status-refresh"));
      } finally {
        setBusyAction(null);
      }
    },
    [loadMaintenance],
  );

  const github = maintenance?.github;
  const radar = maintenance?.radar;
  const cronMode = maintenance?.cronAdapter?.mode || "manual_only";
  const busy = Boolean(busyAction);
  const canUpdate = Boolean(github?.safeToUpdate) && !busy;

  return (
    <section className="settings-section">
      <div className="settings-section-row">
        <SectionHeader icon={<TimerReset size={22} />} title="Maintenance" subtitle="Manual operations and cron placeholders" />
        <span className="inline-status orange">{cronMode.replace(/_/g, " ")}</span>
      </div>
      <MaintenanceGroupFeedback group="github" result={lastResult} busyAction={busyAction} />
      <div className="settings-rowline">
        <div>
          <strong>Local GitHub update</strong>
          <span>
            {maintenanceStatusLabel(maintenance)}
            {github ? ` on ${github.branch}; behind ${github.behind}, ahead ${github.ahead}.` : "."}
            {github ? ` ${githubBlockingSummary(github)}` : ""}
          </span>
        </div>
        <div className="settings-inline-fields">
          <button className="outline-button" type="button" onClick={() => void runAction("github-check")} disabled={busy}>
            <Play size={16} />
            {busyAction === "github-check" ? "Checking" : "Check"}
          </button>
          <button className="outline-button" type="button" onClick={() => void runAction("github-update")} disabled={!canUpdate} title={canUpdate ? "Fast-forward update is available" : "Update requires clean main with safe fast-forward"}>
            <ExternalLink size={16} />
            {busyAction === "github-update" ? "Updating" : "Update"}
          </button>
        </div>
      </div>
      <MaintenanceGroupFeedback group="rebuild" result={lastResult} busyAction={busyAction} />
      <div className="settings-rowline">
        <div>
          <strong>Rebuild from GitHub</strong>
          <span>Plan-only safety gate for a broken local checkout.</span>
        </div>
        <button className="outline-button" type="button" onClick={() => void runAction("rebuild-from-github")} disabled={busy}>
          <ShieldCheck size={16} />
          {busyAction === "rebuild-from-github" ? "Building" : "Build Plan"}
        </button>
      </div>
      <MaintenanceGroupFeedback group="agents" result={lastResult} busyAction={busyAction} />
      <div className="settings-rowline">
        <div>
          <strong>Child agents</strong>
          <span>Refresh Pritha's registry from sibling agent folders.</span>
        </div>
        <button className="outline-button" type="button" onClick={() => void runAction("refresh-agents")} disabled={busy}>
          <Database size={16} />
          {busyAction === "refresh-agents" ? "Refreshing" : "Refresh"}
        </button>
      </div>
      <MaintenanceGroupFeedback group="self" result={lastResult} busyAction={busyAction} />
      <div className="settings-rowline">
        <div>
          <strong>Self knowledge</strong>
          <span>Create a draft self-knowledge refresh artifact.</span>
        </div>
        <button className="outline-button" type="button" onClick={() => void runAction("refresh-self-knowledge")} disabled={busy}>
          <CheckCircle2 size={16} />
          {busyAction === "refresh-self-knowledge" ? "Refreshing" : "Refresh"}
        </button>
      </div>
      <MaintenanceGroupFeedback group="radar" result={lastResult} busyAction={busyAction} />
      <div className="settings-rowline">
        <div>
          <strong>GitHub Knowledge Radar</strong>
          <span>
            {radar?.status || "unknown"}
            {radar ? `; ${radar.candidates} registered candidates.` : "."}
          </span>
        </div>
        <div className="settings-inline-fields">
          <button className="outline-button" type="button" onClick={() => void runAction("github-knowledge-radar")} disabled={busy}>
            <Info size={16} />
            {busyAction === "github-knowledge-radar" ? "Loading" : "Status"}
          </button>
          <button className="outline-button" type="button" onClick={() => void runAction("github-knowledge-radar-search")} disabled={busy}>
            <Globe2 size={16} />
            {busyAction === "github-knowledge-radar-search" ? "Searching" : "Search"}
          </button>
        </div>
      </div>
      <div className="settings-rowline">
        <div>
          <strong>Scheduled execution</strong>
          <span>Cron adapter is disabled until a separate operations decision enables it.</span>
        </div>
        <div className="settings-inline-fields">
          <label className="settings-status-chip unknown">
            <input type="checkbox" disabled />
            Cron off
          </label>
          <select disabled aria-label="Maintenance interval">
            <option>Weekly</option>
          </select>
        </div>
      </div>
    </section>
  );
}

function ProactivityCard({ status }: { status?: ControlCenterStatus }) {
  const proactivity = status?.proactivity;
  const statusLabel = proactivity ? statusText(proactivity.status) : "unknown";
  const cronLabel = proactivity?.cronAdapter === "not_installed" ? "Cron adapter not installed" : `Cron adapter ${proactivity ? statusText(proactivity.cronAdapter) : "unknown"}`;
  const modeLabel = proactivity?.mode === "manual" ? "Manual-only" : proactivity?.mode === "planned" ? "Planned" : "Disabled";

  return (
    <section className="side-card proactivity-card">
      <div className="card-title-row">
        <h2>Proactivity</h2>
        <span className="inline-status orange">{modeLabel}</span>
      </div>
      <div className="proactivity-box">
        <Clock3 size={34} />
        <div>
          <strong>{cronLabel}</strong>
          <span>Proactivity status: {statusLabel}.</span>
        </div>
      </div>
      <button className="outline-button full" type="button" aria-disabled="true" title="Proactivity configuration is planned">
        Configure Draft
      </button>
      <div className="manual-action-row">
        <span>Manual Actions</span>
        <button className="outline-button" type="button" aria-disabled="true" title="Manual checks live on the Agents page">
          <Play size={16} />
          Agents page
        </button>
      </div>
    </section>
  );
}

function ProactivitySettingsSection({ status }: { status?: ControlCenterStatus }) {
  const proactivity = status?.proactivity;
  const statusLabel = proactivity ? statusText(proactivity.status) : "unknown";
  const cronLabel = proactivity?.cronAdapter === "not_installed" ? "Cron adapter not installed" : `Cron adapter ${proactivity ? statusText(proactivity.cronAdapter) : "unknown"}`;
  const modeLabel = proactivity?.mode === "manual" ? "Manual-only" : proactivity?.mode === "planned" ? "Planned" : "Disabled";

  return (
    <section className="settings-section">
      <div className="settings-section-row">
        <SectionHeader icon={<Clock3 size={22} />} title="Proactivity" subtitle="Manual-first activity model" />
        <span className="inline-status orange">{modeLabel}</span>
      </div>
      <div className="settings-rowline">
        <div>
          <strong>Mode</strong>
          <span>Pritha remains manual-first until a separate operations decision enables scheduled work.</span>
        </div>
        <span className="settings-status-chip unknown">{modeLabel}</span>
      </div>
      <div className="settings-rowline">
        <div>
          <strong>Cron adapter</strong>
          <span>{cronLabel}. Proactivity status: {statusLabel}.</span>
        </div>
        <button className="outline-button" type="button" aria-disabled="true" title="Proactivity configuration is planned">
          Configure Draft
        </button>
      </div>
    </section>
  );
}

function SettingsContent({ prefix, access, status }: AccessProps & { prefix: string }) {
  const { activeSection, scrollToSection } = useSettingsAnchors(prefix);
  return (
    <>
      <SettingsTabs activeSection={activeSection} onSelect={scrollToSection} controlsPrefix={prefix} />
      <SettingsAnchorSection prefix={prefix} section="general">
        <LanguageSection id={`${prefix}-language`} />
        <NeuralDeepKeysSection />
        <OpenAIKeysSection />
        <AppearanceSection />
        <DataStorageSection status={status} />
      </SettingsAnchorSection>
      <SettingsAnchorSection prefix={prefix} section="access">
        <AccessSection access={access} />
      </SettingsAnchorSection>
      <SettingsAnchorSection prefix={prefix} section="codex">
        <CodexSettingsSection />
        <SearchSettingsSection />
        <EmbeddingsSettingsSection />
      </SettingsAnchorSection>
      <SettingsAnchorSection prefix={prefix} section="voice">
        <VoiceSettingsSection />
      </SettingsAnchorSection>
      <SettingsAnchorSection prefix={prefix} section="music">
        <MusicSettingsSection />
      </SettingsAnchorSection>
      <SettingsAnchorSection prefix={prefix} section="limits">
        <LimitsSettingsSection />
      </SettingsAnchorSection>
      <SettingsAnchorSection prefix={prefix} section="maintenance">
        <MaintenanceSettingsSection />
      </SettingsAnchorSection>
      <SettingsAnchorSection prefix={prefix} section="proactivity">
        <ProactivitySettingsSection status={status} />
      </SettingsAnchorSection>
    </>
  );
}

export function SettingsControlPage({ access, status }: AccessProps) {
  return (
    <>
      <div className="settings-desktop-content">
        <PageHeader title="Settings" subtitle="Configure Pritha to work the way you want." variant="voice" showCodexButton status={status} />
        <div className="settings-layout">
          <main className="settings-main">
            <SettingsContent prefix="desktop-settings" access={access} status={status} />
          </main>
          <aside className="settings-rail">
            <SummaryCard status={status} />
            <LimitsCard status={status} />
            <ProactivityCard status={status} />
          </aside>
        </div>
      </div>
      <div className="mobile-settings-screen">
        <h1 className="mobile-page-title">Settings</h1>
        <SettingsContent prefix="mobile-settings" access={access} status={status} />
        <SummaryCard status={status} />
      </div>
    </>
  );
}
