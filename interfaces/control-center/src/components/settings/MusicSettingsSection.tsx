"use client";

import { CheckCircle2, ExternalLink, Folder, Info, Music, Radio, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

type MusicSource = "somafm" | "library" | "ace-step";

type MusicSettings = {
  defaultSource: MusicSource;
  somafm: {
    defaultChannelId: string;
  };
  library: {
    repeatMode: "off" | "all";
  };
  aceStep: {
    defaultStyle: string;
  };
  updatedAt: string;
};

const DEFAULT_SETTINGS: MusicSettings = {
  defaultSource: "somafm",
  somafm: {
    defaultChannelId: "groovesalad",
  },
  library: {
    repeatMode: "all",
  },
  aceStep: {
    defaultStyle: "calm organ ambient instrumental background music",
  },
  updatedAt: "",
};

const SOURCE_OPTIONS: Array<{
  id: MusicSource;
  label: string;
  detail: string;
  status: string;
  icon: typeof Music;
}> = [
  {
    id: "somafm",
    label: "SomaFM",
    detail: "Internet radio metadata and playlist URLs. No backend audio proxying.",
    status: "Default",
    icon: Radio,
  },
  {
    id: "library",
    label: "Local Folder",
    detail: "Saved audio files in Pritha's private music library folder.",
    status: "Local",
    icon: Folder,
  },
  {
    id: "ace-step",
    label: "ACE-Step",
    detail: "Generated background music through the existing local ACE-Step service.",
    status: "Generate",
    icon: Sparkles,
  },
];

function sourceStatus(settings: MusicSettings) {
  if (settings.defaultSource === "somafm") return `SomaFM channel: ${settings.somafm.defaultChannelId}`;
  if (settings.defaultSource === "library") return `Local folder repeat: ${settings.library.repeatMode}`;
  return "ACE-Step: ambient";
}

export function MusicSettingsSection() {
  const [settings, setSettings] = useState<MusicSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState<MusicSource | null>(null);

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadSettings() {
    setLoaded(false);
    const response = await fetch("/api/music/settings", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      setStatus("Music settings unavailable");
      return;
    }
    const payload = (await response.json().catch(() => null)) as { settings?: MusicSettings } | null;
    if (!payload?.settings) {
      setStatus("Music settings unavailable");
      return;
    }
    setSettings({ ...DEFAULT_SETTINGS, ...payload.settings });
    setLoaded(true);
    setStatus("");
  }

  async function chooseSource(defaultSource: MusicSource) {
    setSaving(defaultSource);
    setStatus("");
    const response = await fetch("/api/music/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultSource }),
    }).catch(() => null);
    setSaving(null);
    if (!response?.ok) {
      setStatus("Failed to save music source");
      return;
    }
    const payload = (await response.json()) as { settings?: MusicSettings };
    setSettings({ ...DEFAULT_SETTINGS, ...payload.settings });
    setLoaded(true);
    setStatus("Music source saved");
  }

  return (
    <section className="settings-section">
      <div className="settings-section-row">
        <div className="section-header">
          <span className="section-icon">
            <Music size={22} />
          </span>
          <div>
            <h2>Music</h2>
            <p>Default background source for Voice Control</p>
          </div>
        </div>
        <span className="settings-status-chip alive">{loaded ? sourceStatus(settings) : status || "Loading"}</span>
      </div>
      <div className="music-source-grid" role="radiogroup" aria-label="Default music source">
        {SOURCE_OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = settings.defaultSource === option.id;
          return (
            <button
              className={`music-source-option ${selected ? "selected" : ""}`}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={saving !== null}
              onClick={() => void chooseSource(option.id)}
              key={option.id}
            >
              <Icon size={25} />
              <strong>{option.label}</strong>
              <small>{saving === option.id ? "Saving" : option.status}</small>
              <span>{option.detail}</span>
              {selected ? (
                <span className="ready-check ready" aria-label={`${option.label} selected`}>
                  <CheckCircle2 size={18} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="info-note">
        <Info size={17} />
        The Voice screen keeps one Music button. When it is off, providers stay idle and Realtime works as before.
      </div>
      <div className="settings-action-row">
        <a className="outline-button compact" href="https://somafm.com/support/" target="_blank" rel="noreferrer">
          <ExternalLink size={15} />
          Support SomaFM
        </a>
        <span>{status || "Changes apply to the next Music command in Voice Control."}</span>
      </div>
    </section>
  );
}
