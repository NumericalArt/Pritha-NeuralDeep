"use client";

import { useEffect, useState } from "react";
import { KeyRound, RefreshCw, Save, ShieldCheck } from "lucide-react";

type Payload = {
  credential?: {
    configured: boolean;
    status: string;
    storageTarget: string;
    maskedValue: string;
  };
  provider?: {
    ok: boolean;
    state: string;
    statusCode: number | null;
  };
};

export function NeuralDeepKeysSection() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { void load(); }, []);

  async function load() {
    setBusy(true);
    const response = await fetch("/api/settings/neuraldeep-credentials", { cache: "no-store" }).catch(() => null);
    const next = response?.ok ? await response.json().catch(() => null) as Payload | null : null;
    setPayload(next);
    setMessage(next ? "" : "NeuralDeep credential status unavailable");
    setBusy(false);
  }

  async function save() {
    if (!secret.trim()) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/settings/neuraldeep-credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: secret.trim(), confirmation: "save-neuraldeep-key" }),
    }).catch(() => null);
    const next = await response?.json().catch(() => null) as Payload | null;
    if (!response?.ok || !next) {
      setMessage("Failed to save or verify the NeuralDeep key");
    } else {
      setPayload(next);
      setSecret("");
      setMessage(next.provider?.ok ? "NeuralDeep key saved and /v1/limits verified" : "Key saved; NeuralDeep is currently unavailable");
    }
    setBusy(false);
  }

  const configured = payload?.credential?.configured === true;
  const providerState = payload?.provider?.state || "checking";
  return (
    <section className="settings-section" id="neuraldeep-keys">
      <div className="settings-section-row">
        <div className="section-header">
          <span className="section-icon"><KeyRound size={22} /></span>
          <div><h2>NeuralDeep</h2><p>Sole non-voice inference provider through isolated Codex CLI</p></div>
        </div>
        <button className="outline-button" type="button" onClick={() => void load()} disabled={busy}><RefreshCw size={16} /> Check</button>
      </div>
      <div className="settings-rowline settings-secret-row">
        <div>
          <strong>NeuralDeep API key</strong>
          <span>Used by Codex Chat, NeuralDeep Voice, Agent Mother, child agents, and optional NeuralDeep embeddings.</span>
          <span className="settings-secret-meta">
            <span className={`settings-status-chip ${configured ? "alive" : "missing"}`}>{configured ? "Configured" : "Missing"}</span>
            {payload?.credential?.maskedValue ? <code>{payload.credential.maskedValue}</code> : null}
            <span>{payload?.credential?.storageTarget || "macOS Keychain"}</span>
          </span>
        </div>
        <div className="settings-secret-form">
          <input type="password" value={secret} placeholder="sk-…" aria-label="NeuralDeep API key" autoComplete="off" onChange={(event) => setSecret(event.currentTarget.value)} />
          <button className="outline-button" type="button" disabled={!secret.trim() || busy} onClick={() => void save()}><Save size={16} /> {busy ? "Checking" : "Save"}</button>
        </div>
      </div>
      <div className="settings-rowline">
        <div><strong>Provider status</strong><span>Authenticated check against NeuralDeep `/v1/limits`.</span></div>
        <span className={`settings-status-chip ${payload?.provider?.ok ? "alive" : "unknown"}`}>{providerState.replaceAll("_", " ")}</span>
      </div>
      <div className="info-note"><ShieldCheck size={17} /> The key stays in Keychain and is never returned to the browser, written to Git, or passed to Voice Control.</div>
      {message ? <div className="settings-action-row">{message}</div> : null}
    </section>
  );
}
