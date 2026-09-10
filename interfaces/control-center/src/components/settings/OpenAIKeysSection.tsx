"use client";

import { useEffect, useState } from "react";
import { KeyRound, Save, ShieldCheck } from "lucide-react";

type OpenAISecretName = "OPENAI_API_KEY";

type CredentialStatus = {
  name: OpenAISecretName;
  configured: boolean;
  status: string;
  source: string;
  storageTarget: string;
  maskedValue: string;
  lastUpdated?: string;
  browserExposure: string;
  purpose: string;
};

type CredentialsPayload = {
  openaiApiKey: CredentialStatus;
};

const SECRET_ROWS: Array<{
  name: OpenAISecretName;
  title: string;
  subtitle: string;
  placeholder: string;
}> = [
  {
    name: "OPENAI_API_KEY",
    title: "OpenAI API key",
    subtitle: "Used only by the existing OpenAI Realtime Voice Control sidecar.",
    placeholder: "sk-...",
  },
];

function credentialFor(credentials: CredentialsPayload, name: OpenAISecretName) {
  return credentials.openaiApiKey;
}

function statusClass(credential?: CredentialStatus) {
  if (!credential) return "unknown";
  if (credential.configured) return "alive";
  return credential.status === "optional" ? "unknown" : "missing";
}

function sourceLabel(credential?: CredentialStatus) {
  if (!credential) return "Unknown";
  if (!credential.configured) return `Missing, will save to ${credential.storageTarget}`;
  if (credential.source === "process_env") return "Process environment";
  if (credential.source === "env_file") return credential.storageTarget;
  return credential.source.replace(/_/g, " ");
}

export function OpenAIKeysSection() {
  const [credentials, setCredentials] = useState<CredentialsPayload | null>(null);
  const [secretValues, setSecretValues] = useState<Record<OpenAISecretName, string>>({
    OPENAI_API_KEY: "",
  });
  const [savingName, setSavingName] = useState<OpenAISecretName | null>(null);
  const [statusText, setStatusText] = useState("");

  useEffect(() => {
    void loadCredentials();
  }, []);

  async function loadCredentials() {
    setStatusText("");
    const response = await fetch("/api/settings/openai-credentials", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      setStatusText("OpenAI credential status unavailable");
      return;
    }
    const payload = (await response.json().catch(() => null)) as { credentials?: CredentialsPayload } | null;
    if (!payload?.credentials) {
      setStatusText("OpenAI credential status unavailable");
      return;
    }
    setCredentials(payload.credentials);
  }

  async function saveSecret(name: OpenAISecretName) {
    const value = secretValues[name].trim();
    if (!value) return;
    setSavingName(name);
    setStatusText("");
    const response = await fetch("/api/settings/openai-credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, value, confirmation: "save-openai-key" }),
    }).catch(() => null);
    setSavingName(null);
    if (!response?.ok) {
      setStatusText("Failed to save OpenAI credential");
      return;
    }
    const payload = (await response.json().catch(() => null)) as { credentials?: CredentialsPayload } | null;
    if (payload?.credentials) setCredentials(payload.credentials);
    setSecretValues((current) => ({ ...current, [name]: "" }));
    setStatusText(`${name} saved to server-side environment store`);
  }

  return (
    <section className="settings-section">
      <div className="settings-section-row">
        <div className="section-header">
          <span className="section-icon">
            <KeyRound size={22} />
          </span>
          <div>
            <h2>OpenAI Voice Control</h2>
            <p>Voice-only exception; not available to Codex CLI processes</p>
          </div>
        </div>
      </div>
      {SECRET_ROWS.map((row) => {
        const credential = credentials ? credentialFor(credentials, row.name) : undefined;
        return (
          <div className="settings-rowline settings-secret-row" key={row.name}>
            <div>
              <strong>{row.title}</strong>
              <span>{row.subtitle}</span>
              <span className="settings-secret-meta">
                <span className={`settings-status-chip ${statusClass(credential)}`}>{credential?.configured ? "Configured" : credential?.status || "Loading"}</span>
                {credential?.maskedValue ? <code>{credential.maskedValue}</code> : null}
                <span>{sourceLabel(credential)}</span>
              </span>
            </div>
            <div className="settings-secret-form">
              <input
                type="password"
                value={secretValues[row.name]}
                placeholder={row.placeholder}
                aria-label={row.title}
                autoComplete="off"
                onChange={(event) => setSecretValues((current) => ({ ...current, [row.name]: event.currentTarget.value }))}
              />
              <button className="outline-button" type="button" disabled={!secretValues[row.name].trim() || savingName === row.name} onClick={() => saveSecret(row.name)}>
                <Save size={16} />
                {savingName === row.name ? "Saving" : "Save"}
              </button>
            </div>
          </div>
        );
      })}
      <div className="info-note">
        <ShieldCheck size={17} />
        Secret values are never rendered back into Settings. Existing values are shown only as masked status.
      </div>
      {statusText ? <div className="settings-action-row">{statusText}</div> : null}
    </section>
  );
}
