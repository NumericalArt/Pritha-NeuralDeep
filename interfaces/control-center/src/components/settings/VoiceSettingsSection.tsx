"use client";

import { useEffect, useState } from "react";
import { MemoryStick, Save } from "lucide-react";
import {
  PRITHA_FEMININE_VOICE_OPTIONS,
  VOICE_BEHAVIOR_PROFILE_OPTIONS,
  isPrithaVoiceId,
  isVoiceBehaviorProfile,
  type PrithaVoiceId,
  type VoiceBehaviorProfile,
} from "@/lib/realtime/voice-settings";
import { DEFAULT_CHAINED_VOICE_SETTINGS, CHAINED_VOICES, VOICE_SETTINGS_CHANGED_EVENT, type ChainedVoiceSettings, type VoiceTransportId } from "@/lib/voice/settings";
import { readStickyContextSetting, writeStickyContextSetting } from "@/components/voice/voicePreferences";

type RuntimeSettings = {
  voiceBehaviorProfile: VoiceBehaviorProfile;
  prithaVoice: PrithaVoiceId;
  voiceTransport: VoiceTransportId;
  neuraldeepVoice: ChainedVoiceSettings;
  updatedAt: string;
};

const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  voiceBehaviorProfile: "advanced",
  prithaVoice: "marin",
  voiceTransport: "openai_realtime",
  neuraldeepVoice: DEFAULT_CHAINED_VOICE_SETTINGS,
  updatedAt: "",
};

export function VoiceSettingsSection() {
  const [stickyContextEnabled, setStickyContextEnabled] = useState(true);
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings>(DEFAULT_RUNTIME_SETTINGS);
  const [runtimeSettingsLoaded, setRuntimeSettingsLoaded] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStickyContextEnabled(readStickyContextSetting(true));
    void loadRuntimeSettings();
  }, []);

  function updateStickyContext(enabled: boolean) {
    setStickyContextEnabled(enabled);
    writeStickyContextSetting(enabled);
  }

  async function loadRuntimeSettings() {
    setRuntimeSettingsLoaded(false);
    const response = await fetch("/api/realtime/runtime-settings", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      setRuntimeStatus("Runtime settings unavailable");
      return;
    }
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      settings?: RuntimeSettings;
    } | null;
    if (payload?.ok !== true || !isPrithaVoiceId(payload.settings?.prithaVoice) || !isVoiceBehaviorProfile(payload.settings?.voiceBehaviorProfile)) {
      setRuntimeStatus("Runtime settings unavailable");
      return;
    }
    setRuntimeSettings({ ...DEFAULT_RUNTIME_SETTINGS, ...payload.settings });
    setRuntimeSettingsLoaded(true);
    setRuntimeStatus("");
  }

  async function saveRuntimeSettings() {
    setSaving(true);
    setRuntimeStatus("");
    const response = await fetch("/api/realtime/runtime-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voiceBehaviorProfile: runtimeSettings.voiceBehaviorProfile,
        prithaVoice: runtimeSettings.prithaVoice,
        voiceTransport: runtimeSettings.voiceTransport,
        neuraldeepVoice: runtimeSettings.neuraldeepVoice,
      }),
    }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { ok?: boolean; settings?: RuntimeSettings } | null;
    setSaving(false);
    if (!response?.ok || payload?.ok !== true || !isPrithaVoiceId(payload.settings?.prithaVoice) || !isVoiceBehaviorProfile(payload.settings?.voiceBehaviorProfile)) {
      setRuntimeStatus("Failed to save runtime settings");
      return;
    }
    setRuntimeSettings({ ...DEFAULT_RUNTIME_SETTINGS, ...payload.settings });
    setRuntimeStatus("Runtime settings saved");
    window.dispatchEvent(new Event(VOICE_SETTINGS_CHANGED_EVENT));
  }

  function updateRuntimeSetting<K extends keyof RuntimeSettings>(key: K, value: RuntimeSettings[K]) {
    setRuntimeSettings((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="settings-section">
      <div className="settings-section-row">
        <div className="section-header">
          <span className="section-icon">
            <MemoryStick size={22} />
          </span>
          <div>
            <h2>Voice</h2>
            <p>Live session behavior</p>
          </div>
        </div>
      </div>
      <div className="settings-rowline">
        <div>
          <strong>Sticky Context</strong>
          <span>Default on. Pins current-session recap and Codex task state into the live Realtime dialogue.</span>
        </div>
        <label className="settings-switch" aria-label="Sticky Context">
          <input type="checkbox" checked={stickyContextEnabled} onChange={(event) => updateStickyContext(event.currentTarget.checked)} />
          <span />
        </label>
      </div>
      {!runtimeSettingsLoaded ? (
        <div className="settings-rowline">
          <div>
            <strong>Voice Runtime</strong>
            <span>{runtimeStatus || "Loading saved voice runtime settings..."}</span>
          </div>
        </div>
      ) : (
        <>
          <div className="settings-rowline">
            <div><strong>Voice Transport</strong><span>Changes apply on the next connection.</span></div>
            <select aria-label="Voice transport" disabled={saving} value={runtimeSettings.voiceTransport} onChange={e=>updateRuntimeSetting("voiceTransport",e.currentTarget.value as VoiceTransportId)}>
              <option value="openai_realtime">OpenAI Realtime</option>
              <option value="neuraldeep_chained">NeuralDeep — experimental</option>
            </select>
          </div>
          {runtimeSettings.voiceTransport === "neuraldeep_chained" && <>
            <div className="settings-rowline"><div><strong>Language</strong><span>Speech recognition and spoken replies.</span></div><select aria-label="NeuralDeep voice language" disabled={saving} value={runtimeSettings.neuraldeepVoice.language} onChange={e=>updateRuntimeSetting("neuraldeepVoice",{...runtimeSettings.neuraldeepVoice,language:e.currentTarget.value as ChainedVoiceSettings['language']})}><option value="auto">Auto</option><option value="ru">Русский</option><option value="en">English</option></select></div>
            <div className="settings-rowline"><div><strong>NeuralDeep Voice</strong><span>Experimental speech synthesis.</span></div><select aria-label="NeuralDeep voice" disabled={saving} value={runtimeSettings.neuraldeepVoice.voice} onChange={e=>updateRuntimeSetting("neuraldeepVoice",{...runtimeSettings.neuraldeepVoice,voice:e.currentTarget.value as ChainedVoiceSettings['voice']})}>{CHAINED_VOICES.map(voice=><option key={voice} value={voice}>{voice}</option>)}</select></div>
          </>}
          <div className="settings-rowline">
            <div>
              <strong>Behavior Detail</strong>
              <span>Default depth for spoken Pritha answers. The operator can still ask for simpler or deeper answers in a session.</span>
            </div>
            <select
              value={runtimeSettings.voiceBehaviorProfile}
              aria-label="Voice behavior detail level"
              disabled={saving}
              onChange={(event) => updateRuntimeSetting("voiceBehaviorProfile", event.currentTarget.value as RuntimeSettings["voiceBehaviorProfile"])}
            >
              {VOICE_BEHAVIOR_PROFILE_OPTIONS.map((option) => (
                <option value={option.id} key={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Pritha Voice</strong>
              <span>Approved feminine voices only. Changes apply on the next voice session or reconnect.</span>
            </div>
            <select
              value={runtimeSettings.prithaVoice}
              aria-label="Pritha voice"
              disabled={saving}
              onChange={(event) => updateRuntimeSetting("prithaVoice", event.currentTarget.value as RuntimeSettings["prithaVoice"])}
            >
              {PRITHA_FEMININE_VOICE_OPTIONS.map((option) => (
                <option value={option.id} key={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-action-row">
            <button className="outline-button" type="button" onClick={saveRuntimeSettings} disabled={saving}>
              <Save size={16} />
              {saving ? "Saving" : "Save Voice Runtime"}
            </button>
            <span role="status">{runtimeStatus || "Changes apply on the next voice session or reconnect."}</span>
          </div>
        </>
      )}
    </section>
  );
}
