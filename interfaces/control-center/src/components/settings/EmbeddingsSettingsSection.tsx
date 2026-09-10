"use client";

import { Database, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

type Coverage = {
  ok: boolean;
  eligible: number;
  embedded: number;
  missing: number;
  dimensions: number | null;
  complete: boolean;
};

type StatusPayload = {
  settings?: {
    activeProvider: "local" | "neuraldeep";
    neuraldeep: { model: string | null };
  };
  coverage?: { local?: Coverage; neuraldeep?: Coverage | null };
  indexing?: { status?: string; processed?: number; totalPending?: number; error?: string } | null;
  error?: string;
};

type CatalogPayload = {
  source?: string;
  embeddings?: Array<{ id: string; limit?: { context?: number } }>;
};

export function EmbeddingsSettingsSection() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { void load(); }, []);

  async function load() {
    setBusy(true);
    const [statusResponse, catalogResponse] = await Promise.all([
      fetch("/api/settings/embeddings", { cache: "no-store" }).catch(() => null),
      fetch("/api/settings/neuraldeep-models", { cache: "no-store" }).catch(() => null),
    ]);
    const nextStatus = statusResponse?.ok ? await statusResponse.json().catch(() => null) as StatusPayload | null : null;
    const nextCatalog = catalogResponse?.ok ? await catalogResponse.json().catch(() => null) as CatalogPayload | null : null;
    setStatus(nextStatus);
    setCatalog(nextCatalog);
    const configured = nextStatus?.settings?.neuraldeep.model || "";
    const first = nextCatalog?.embeddings?.[0]?.id || "";
    setModel(configured || first);
    setMessage(nextStatus ? "" : "Embeddings settings unavailable");
    setBusy(false);
  }

  async function action(actionName: string, confirmation?: string) {
    if ((actionName === "configure-neuraldeep" || actionName === "start-neuraldeep-index") && !model) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/settings/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: actionName, model, confirmation }),
    }).catch(() => null);
    const payload = await response?.json().catch(() => null) as StatusPayload | null;
    if (!response?.ok || !payload) {
      setMessage(payload?.error === "neuraldeep_embedding_index_incomplete"
        ? "NeuralDeep index is not complete yet; Local remains active."
        : `Embeddings action failed${payload?.error ? `: ${payload.error}` : ""}`);
    } else {
      setStatus(payload);
      setMessage(actionName === "start-neuraldeep-index"
        ? "NeuralDeep indexing started. Local search remains active until coverage reaches 100%."
        : "Embeddings settings updated.");
    }
    setBusy(false);
  }

  function startRemoteIndex() {
    if (!window.confirm("Build a parallel NeuralDeep index? Eligible memory chunks will be sent to the selected NeuralDeep embedding model and may consume provider quota.")) return;
    void action("start-neuraldeep-index", "send-memory-to-neuraldeep-for-embedding");
  }

  const active = status?.settings?.activeProvider || "local";
  const local = status?.coverage?.local;
  const remote = status?.coverage?.neuraldeep;
  const models = catalog?.embeddings || [];
  return (
    <section className="settings-section">
      <div className="settings-section-row">
        <div className="section-header">
          <span className="section-icon"><Database size={22} /></span>
          <div><h2>Embeddings</h2><p>Separate local and NeuralDeep semantic-memory indexes</p></div>
        </div>
        <button className="outline-button" type="button" disabled={busy} onClick={() => void load()}><RefreshCw size={16} /> Refresh</button>
      </div>
      <div className="settings-rowline">
        <div>
          <strong>Local MiniLM</strong>
          <span>Default offline index. It is retained even when NeuralDeep is selected.</span>
          <span>{local ? `${local.embedded.toLocaleString("en-US")} / ${local.eligible.toLocaleString("en-US")} chunks · ${local.dimensions || 0} dimensions` : "Coverage unavailable"}</span>
        </div>
        <button className={`outline-button${active === "local" ? " active" : ""}`} type="button" disabled={busy || active === "local"} onClick={() => void action("activate-local")}>
          {active === "local" ? "Active" : "Use Local"}
        </button>
      </div>
      <div className="settings-rowline">
        <div>
          <strong>NeuralDeep embedding model</strong>
          <span>Models are loaded dynamically from authenticated `/v1/models`.</span>
        </div>
        <select value={model} aria-label="NeuralDeep embedding model" disabled={busy || models.length === 0} onChange={(event) => setModel(event.currentTarget.value)}>
          {models.length ? models.map((item) => <option value={item.id} key={item.id}>{item.id}</option>) : <option value="">No embedding models available</option>}
        </select>
      </div>
      <div className="settings-rowline">
        <div>
          <strong>NeuralDeep index</strong>
          <span>{remote ? `${remote.embedded.toLocaleString("en-US")} / ${remote.eligible.toLocaleString("en-US")} chunks · ${remote.dimensions || 0} dimensions` : "Select and save a model to prepare a parallel index."}</span>
          {status?.indexing?.status ? <span>Indexer: {status.indexing.status.replaceAll("_", " ")}</span> : null}
        </div>
        <div className="settings-secret-form">
          <button className="outline-button" type="button" disabled={busy || !model} onClick={() => void action("configure-neuraldeep")}>Save model</button>
          <button className="outline-button" type="button" disabled={busy || !model} onClick={startRemoteIndex}>Build index</button>
          <button className="outline-button" type="button" disabled={busy || !remote?.complete || active === "neuraldeep"} onClick={() => void action("activate-neuraldeep")}>
            {active === "neuraldeep" ? "Active" : "Use NeuralDeep"}
          </button>
        </div>
      </div>
      <div className="info-note">Indexes are isolated by provider, model, dimensions, and content hash. NeuralDeep cannot become active before 100% coverage.</div>
      {message ? <div className="settings-action-row" role="status">{message}</div> : null}
    </section>
  );
}
