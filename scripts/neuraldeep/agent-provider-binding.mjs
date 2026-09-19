import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { agentInstanceKey, readAgentCatalog, readAgentOperationsManifest } from '../agents-mother/identity.mjs';
import { neuralDeepUsageKnown } from './usage-ledger.mjs';

const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const hash = value => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
export class AgentProviderError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}

/** Only the canonical ID from this instance's current catalog is authoritative. */
export function ownedProviderAgent(options, agentId) {
  const catalog = readAgentCatalog({ ...options, canonical: true, fresh: true });
  const agent = catalog.agents.find(item => item.id === agentId);
  if (!agent || agent.instanceKey !== agentInstanceKey(options.stateRoot)
    || agent.catalogPresence !== 'project' || agent.identityStatus === 'conflict'
    || !agent.projectPath || !agent.contractSource) throw new AgentProviderError('provider_agent_not_owned', 404);
  const { manifest } = readAgentOperationsManifest(agent);
  if (manifest?.control_center_managed !== true || manifest?.control_center_runtime?.manager !== 'detached-node-process') {
    throw new AgentProviderError('provider_runtime_unsupported');
  }
  try {
    const folder = path.resolve(agent.projectPath), parent = realpathSync(options.agentParent);
    if (lstatSync(folder).isSymbolicLink() || !lstatSync(folder).isDirectory()
      || path.dirname(realpathSync(folder)) !== parent || realpathSync(folder) === realpathSync(options.root)) throw new Error();
    return { id: agent.id, instanceKey: agent.instanceKey, projectPath: realpathSync(folder) };
  } catch { throw new AgentProviderError('provider_agent_not_owned', 404); }
}

/** Additive tables in the existing instance admission DB. No prompts or keys. */
export class AgentProviderBindings {
  constructor(coordination, options) {
    this.store = coordination; this.db = coordination.db; this.options = options;
    this.store.transaction(() => this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_provider_bindings (
        instance_key TEXT NOT NULL, agent_id TEXT NOT NULL, project_path TEXT NOT NULL,
        mode TEXT NOT NULL, model TEXT, revision INTEGER NOT NULL, token_hash TEXT,
        updated_at TEXT NOT NULL, PRIMARY KEY(instance_key,agent_id));
      CREATE TABLE IF NOT EXISTS agent_provider_requests (
        id TEXT PRIMARY KEY, instance_key TEXT NOT NULL, agent_id TEXT NOT NULL,
        model TEXT NOT NULL, request_hash TEXT NOT NULL, binding_revision INTEGER NOT NULL,
        status TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT,
        usage TEXT, usage_known INTEGER NOT NULL DEFAULT 0, accounted INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS agent_provider_requests_owner ON agent_provider_requests(instance_key,agent_id,status);
    `));
  }
  identity(agentId) { return ownedProviderAgent(this.options, agentId); }
  record(agentId) {
    const owner = this.identity(agentId);
    const row = this.db.prepare('SELECT * FROM agent_provider_bindings WHERE instance_key=? AND agent_id=?').get(owner.instanceKey, owner.id);
    if (row && row.project_path !== owner.projectPath) throw new AgentProviderError('provider_binding_identity_changed');
    return { owner, row };
  }
  view(agentId, provider = {}) {
    const { owner, row } = this.record(agentId);
    const unresolved = this.db.prepare("SELECT id,status FROM agent_provider_requests WHERE instance_key=? AND agent_id=? AND (status IN ('reserved','dispatched') OR (status!='cancelled' AND usage_known=0)) ORDER BY started_at LIMIT 1").get(owner.instanceKey, owner.id);
    const modelAvailable = Array.isArray(provider.models) && provider.models.includes(row?.model);
    const mode = row?.mode || 'none';
    return { agentId, mode, model: row?.model || null, revision: row?.revision || 0,
      state: mode === 'none' ? 'disconnected' : unresolved ? 'reconciliation_required'
        : provider.configured !== true ? 'provider_not_configured' : !modelAvailable ? 'model_unavailable'
          : !row?.token_hash ? 'restart_required' : 'ready',
      configured: provider.configured === true, modelAvailable,
      restartRequired: mode !== 'none' && !row?.token_hash,
      blocker: unresolved ? { requestId: unresolved.id, code: unresolved.status === 'reserved' ? 'provider_request_pending' : 'provider_usage_unconfirmed' } : null };
  }
  set(agentId, input, provider = {}) {
    if (!['none', 'instance-neuraldeep'].includes(input?.mode) || !Number.isSafeInteger(input.expectedRevision)) throw new AgentProviderError('provider_binding_invalid', 400);
    if (input.mode === 'instance-neuraldeep' && (!MODEL.test(input.model || '') || !provider.models?.includes(input.model))) throw new AgentProviderError('provider_model_unavailable', 400);
    this.store.transaction(() => {
      const { owner, row } = this.record(agentId);
      if ((row?.revision || 0) !== input.expectedRevision) throw new AgentProviderError('provider_binding_revision_stale');
      const model = input.mode === 'none' ? row?.model || null : input.model;
      if (row?.mode === input.mode && row?.model === model) return;
      // Disconnect/restore keeps the scoped process capability, but every request
      // rechecks mode. A model change needs a restart to inject the chosen model.
      const token = row?.model === model ? row?.token_hash || null : null;
      this.db.prepare(`INSERT INTO agent_provider_bindings VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(instance_key,agent_id) DO UPDATE SET mode=excluded.mode,model=excluded.model,
        revision=excluded.revision,token_hash=excluded.token_hash,updated_at=excluded.updated_at`)
        .run(owner.instanceKey, owner.id, owner.projectPath, input.mode, model, (row?.revision || 0) + 1, token, now());
    });
    return this.view(agentId, provider);
  }
  issueEnvironment(agentId, { port, provider }) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new AgentProviderError('provider_broker_port_invalid');
    return this.store.transaction(() => {
      const { row } = this.record(agentId);
      if (!row || row.mode === 'none') return {};
      const state = this.view(agentId, provider);
      if (!['ready','restart_required'].includes(state.state)) throw new AgentProviderError(state.blocker?.code || state.state);
      const token = `pritha_child_${randomBytes(32).toString('base64url')}`;
      this.db.prepare('UPDATE agent_provider_bindings SET token_hash=?,revision=revision+1,updated_at=? WHERE instance_key=? AND agent_id=?')
        .run(hash(token), now(), row.instance_key, agentId);
      return { PRITHA_LLM_BASE_URL: `http://127.0.0.1:${port}/api/agents/${encodeURIComponent(agentId)}/llm/v1`,
        PRITHA_LLM_MODEL: row.model, PRITHA_LLM_TOKEN: token };
    });
  }
  authorize(agentId, token) {
    const { row } = this.record(agentId);
    if (!/^[a-f0-9]{64}$/.test(row?.token_hash || '') || typeof token !== 'string' || !/^pritha_child_[A-Za-z0-9_-]{43}$/.test(token)
      || !timingSafeEqual(Buffer.from(row.token_hash, 'hex'), Buffer.from(hash(token), 'hex'))) throw new AgentProviderError('provider_binding_unauthorized', 401);
    if (row.mode !== 'instance-neuraldeep') throw new AgentProviderError('provider_binding_disabled', 403);
    return { model: row.model, revision: row.revision };
  }
  reserve(agentId, token, requestId, requestHash) {
    if (!ID.test(requestId) || !/^[a-f0-9]{64}$/.test(requestHash)) throw new AgentProviderError('provider_request_invalid', 400);
    return this.store.transaction(() => {
      const auth = this.authorize(agentId, token), { owner } = this.record(agentId);
      if (this.db.prepare('SELECT 1 FROM agent_provider_requests WHERE id=?').get(requestId)) throw new AgentProviderError('provider_request_already_processed');
      const unresolved = this.db.prepare("SELECT 1 FROM agent_provider_requests WHERE instance_key=? AND agent_id=? AND (status IN ('reserved','dispatched') OR (status!='cancelled' AND usage_known=0))").get(owner.instanceKey, owner.id);
      if (unresolved) throw new AgentProviderError('provider_usage_unconfirmed');
      this.db.prepare("INSERT INTO agent_provider_requests(id,instance_key,agent_id,model,request_hash,binding_revision,status,started_at) VALUES(?,?,?,?,?,?,'reserved',?)")
        .run(requestId, owner.instanceKey, agentId, auth.model, requestHash, auth.revision, now());
      return { ...auth, requestId };
    });
  }
  current(agentId, token, revision) {
    const auth = this.authorize(agentId, token);
    if (auth.revision !== revision) throw new AgentProviderError('provider_binding_changed');
  }
  dispatched(requestId, agentId, token) {
    this.store.transaction(() => {
      const row = this.db.prepare('SELECT * FROM agent_provider_requests WHERE id=?').get(requestId);
      if (!row || row.agent_id !== agentId || row.status !== 'reserved') throw new AgentProviderError('provider_request_state_invalid');
      this.current(agentId, token, row.binding_revision);
      this.db.prepare("UPDATE agent_provider_requests SET status='dispatched' WHERE id=?").run(requestId);
    });
  }
  finish(requestId, { status, usage } = {}) {
    this.store.transaction(() => {
      const row = this.db.prepare('SELECT * FROM agent_provider_requests WHERE id=?').get(requestId);
      if (!row || !['reserved','dispatched'].includes(row.status)) return;
      const notSent = row.status === 'reserved', known = notSent || neuralDeepUsageKnown(usage);
      const input = usage?.prompt_tokens ?? usage?.input_tokens ?? usage?.inputTokens;
      const output = usage?.completion_tokens ?? usage?.output_tokens ?? usage?.outputTokens;
      const safeUsage = known && !notSent ? { prompt_tokens: input, completion_tokens: output, total_tokens: input + output } : null;
      this.db.prepare('UPDATE agent_provider_requests SET status=?,finished_at=?,usage=?,usage_known=?,accounted=? WHERE id=?')
        .run(notSent ? 'cancelled' : status === 'completed' ? 'completed' : 'failed', now(), safeUsage ? JSON.stringify(safeUsage) : null, known ? 1 : 0, notSent ? 1 : 0, requestId);
    });
  }
  pendingAccounting() { return this.db.prepare("SELECT * FROM agent_provider_requests WHERE accounted=0 AND status IN ('completed','failed') ORDER BY started_at LIMIT 100").all().map(row => ({ ...row, usage: row.usage ? JSON.parse(row.usage) : null })); }
  accounted(requestId) { this.db.prepare('UPDATE agent_provider_requests SET accounted=1 WHERE id=?').run(requestId); }
}

const BASE_ENV = new Set(['PATH','HOME','USER','LOGNAME','SHELL','TMPDIR','TMP','TEMP','LANG','LC_ALL','LC_CTYPE','TZ','SYSTEMROOT','COMSPEC','PATHEXT']);
const forbidden = name => /(?:TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL|AUTH|COOKIE)/i.test(name)
  || /^(?:PRITHA_(?:NEURALDEEP|LLM)|NEURALDEEP|OPENAI|AZURE_OPENAI|CHATGPT|CODEX)_/i.test(name)
  || /^(?:NODE_OPTIONS|NODE_PATH|BASH_ENV|ENV|ZDOTDIR)$/.test(name);
/** The child receives no ambient Pritha credentials, even via env_allowlist. */
export function managedAgentEnvironment(parent = process.env, declared = {}, binding = {}) {
  const environment = { NODE_ENV: ['production','development','test'].includes(parent.NODE_ENV) ? parent.NODE_ENV : 'production' };
  for (const name of BASE_ENV) if (typeof parent[name] === 'string') environment[name] = parent[name];
  for (const [name, value] of Object.entries(declared)) if (/^[A-Z_][A-Z0-9_]{0,100}$/.test(name) && !forbidden(name) && typeof value === 'string') environment[name] = value;
  for (const name of ['PRITHA_LLM_BASE_URL','PRITHA_LLM_MODEL','PRITHA_LLM_TOKEN']) if (typeof binding[name] === 'string') environment[name] = binding[name];
  return environment;
}

export function redactAgentRuntimeOutput(value, environment) {
  let text = String(value || '');
  if (environment?.PRITHA_LLM_TOKEN) text = text.split(environment.PRITHA_LLM_TOKEN).join('[redacted]');
  return text.replace(/pritha_child_[A-Za-z0-9_-]{43}/g, '[redacted]');
}
