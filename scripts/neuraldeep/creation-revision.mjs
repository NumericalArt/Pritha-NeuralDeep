import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, renameSync, rmdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile, withFileLock } from '../lib/atomic-file.mjs';
import { readBoundedRegularFile } from '../lib/safe-file-read.mjs';
import { parseFrontmatterData } from '../lib/frontmatter.mjs';
import { verifyPreparedOutcomeVerifierPreset } from '../agents-mother/outcome-verifier-presets.mjs';
import { AgentCreationError } from './agent-creation-store.mjs';
import { creationDraftRoot, reconcileCreationArtifacts } from './agent-creation.mjs';
import { creationHostDirectory } from './creation-research.mjs';
import { creationGeneration, creationCanonicalFilename } from './creation-generation.mjs';
import { creationRuntimeReceipt } from './creation-runtime-receipt.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const bounded = (file, root) => readBoundedRegularFile(file, { allowedRoots: [root], maxBytes: 8 * 1024 * 1024 });
const read = (file, root) => bounded(file, root).text;
const fail = (code, message) => { throw new AgentCreationError(code, message); };
function directory(file) {
  if (!existsSync(file) || !lstatSync(file).isDirectory() || lstatSync(file).isSymbolicLink()) fail('creation_revision_boundary');
}
function paths(job, options) {
  if (!/^creation_[a-f0-9]{24}$/.test(job.jobId) || path.resolve(job.draftRoot) !== creationDraftRoot(path.resolve(options.stateRoot), job.instanceId, job.chatId)) fail('creation_revision_identity');
  return path.join(options.stateRoot, 'audit', 'creation-revisions', job.jobId);
}
function receiptAt(file, job, options) {
  const receipt = JSON.parse(read(file, options.stateRoot));
  if (receipt.schema !== 'pritha-creation-revision-v1' || receipt.jobId !== job.jobId || receipt.chatId !== job.chatId
    || receipt.instanceId !== job.instanceId || receipt.target !== job.target || receipt.draftRoot !== job.draftRoot || receipt.releaseSha !== job.releaseSha
    || !['prepared', 'completed'].includes(receipt.status) || receipt.toGeneration !== receipt.fromGeneration + 1
    || receipt.requestHash !== digest(JSON.stringify(receipt.request))) fail('creation_revision_receipt_invalid');
  return receipt;
}
/** A crash is observable before a model or a different action can continue. */
export function creationRevisionPending(job, options) {
  const root = paths(job, options);
  if (!existsSync(root)) return null;
  directory(root);
  const files = readdirSync(root).filter(name => /^revision-\d+\.json$/.test(name));
  if (files.length > 100) fail('creation_revision_limit');
  for (const name of files) {
    const receipt = receiptAt(path.join(root, name), job, options);
    if (receipt.status !== 'completed' || receipt.toGeneration > creationGeneration(job)) return { request: receipt.request, generation: receipt.toGeneration, receiptPath: path.join(root, name) };
  }
  return null;
}
function manifest(root, excluded = new Set()) {
  directory(root);
  const entries = []; let bytes = 0;
  const walk = (relative = '') => {
    const base = path.join(root, relative);
    for (const name of readdirSync(base).sort()) {
      if (!relative && excluded.has(name)) continue;
      const rel = relative ? `${relative}/${name}` : name, full = path.join(root, rel), stat = lstatSync(full);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) fail('creation_revision_boundary');
      if (entries.length >= 1024) fail('creation_revision_draft_limit');
      if (stat.isDirectory()) { entries.push({ path: rel, kind: 'directory' }); walk(rel); }
      else {
        bytes += stat.size;
        if (stat.size > 2 * 1024 * 1024 || bytes > 16 * 1024 * 1024) fail('creation_revision_draft_limit');
        entries.push({ path: rel, kind: 'file', hash: digest(bounded(full, root).buffer) });
      }
    }
  };
  walk(); return entries;
}
function assertSameManifest(root, expected) {
  if (JSON.stringify(manifest(root)) !== JSON.stringify(expected)) fail('creation_revision_drafts_changed');
}
function quiescent(job, request, coordination) {
  if (!coordination?.db || typeof coordination.transaction !== 'function') fail('creation_revision_host_proof_required');
  const current = coordination.db.prepare('SELECT record FROM agent_creation_jobs WHERE chat_id=?').get(job.chatId);
  if (!current || JSON.parse(current.record).revision !== job.revision) fail('creation_revision_stale');
  const actions = coordination.db.prepare("SELECT request_id,request FROM agent_creation_actions WHERE chat_id=? AND status='started'").all(job.chatId);
  if (actions.length !== 1 || actions[0].request_id !== request.requestId || actions[0].request !== JSON.stringify(request)) fail('creation_revision_action_required');
  if (job.activeTurnId || job.status === 'running' || job.budget?.unknownAttempts?.length) fail('creation_revision_execution_unsettled');
  const turns = Object.keys(job.budget?.turns || {});
  if (turns.length > 1000) fail('creation_revision_attempt_limit');
  const parameters = [job.chatId, ...turns];
  let attempts = coordination.db.prepare(`SELECT * FROM attempts WHERE json_extract(payload,'$.chatId')=?${turns.length ? ` OR workload IN (${turns.map(() => '?').join(',')})` : ''}`).all(...parameters);
  const scopes = [...new Set(attempts.flatMap(row => [row.scope, row.session_scope]).filter(Boolean))];
  if (scopes.length) {
    const marks = scopes.map(() => '?').join(',');
    attempts = coordination.db.prepare(`SELECT * FROM attempts WHERE scope IN (${marks}) OR session_scope IN (${marks})`).all(...scopes, ...scopes);
  }
  if (attempts.length > 10000) fail('creation_revision_attempt_limit');
  for (const attempt of attempts) {
    if (!['completed', 'failed', 'cancelled'].includes(attempt.status)) fail('creation_revision_execution_unsettled');
    const owner = coordination.db.prepare('SELECT run_id FROM runtime_owners WHERE admission_id=?').get(attempt.id);
    const hostTurn = job.budget?.turns?.[attempt.workload];
    // Admission is not provider dispatch. A completed host turn can prove a
    // prelaunch probe rejection, but never override an existing runtime receipt.
    const noLaunch = !owner && hostTurn?.dispatched === false && hostTurn.tokens === 0;
    const receipt = creationRuntimeReceipt(coordination, attempt.workload, { dispatched: !noLaunch && Boolean(attempt.admitted_at || owner || hostTurn?.dispatched) });
    if (!receipt.processExited || receipt.tokens === null || owner && !receipt.runs.some(run => run.runId === owner.run_id)) fail('creation_revision_execution_unsettled');
    const ownAttempt = JSON.parse(attempt.payload || '{}').chatId === job.chatId;
    if (ownAttempt && (attempt.admitted_at || owner || receipt.runs.length) && job.budget?.turns?.[attempt.workload]?.tokens !== receipt.tokens) fail('creation_revision_execution_unsettled');
  }
  for (const turnId of turns) {
    const turn = job.budget.turns[turnId];
    if (!turn.dispatched) continue;
    const receipt = creationRuntimeReceipt(coordination, turnId);
    if (!receipt.processExited || receipt.tokens === null || turn.tokens !== receipt.tokens) fail('creation_revision_execution_unsettled');
  }
}
function assertBeforeScaffold(job, options) {
  if (job.scaffoldReady || job.scaffoldReceipt || job.deliveryRunId || job.delivery || ['ready', 'cancelled'].includes(job.status)
    || existsSync(path.join(options.stateRoot, 'audit', 'creation-scaffolds', `${job.jobId}.json`))
    || existsSync(path.join(options.stateRoot, 'audit', 'creation-delivery', `creation-${digest(JSON.stringify([job.instanceId, job.jobId])).slice(0, 40)}.json`))
    || existsSync(path.join(job.target, '.git')) || existsSync(path.join(job.target, 'delivery', 'outcome-lineage.json'))) {
    fail('creation_revision_requires_new_target', 'После начала сборки изменение задания требует новой задачи и нового каталога агента.');
  }
}
function targetReservation(job, options) {
  directory(job.target);
  if (!readdirSync(job.target).length) return null;
  const preset = parseFrontmatterData(job.contract?.text || '')?.outcome_trial_preset;
  let receipt;
  try { receipt = verifyPreparedOutcomeVerifierPreset(job.target, preset, options); }
  catch { fail('creation_revision_target_changed', 'В каталоге агента есть данные сверх подготовленного хостом verifier. Нужна новая задача и новый каталог.'); }
  if (receipt.creationJobId !== job.jobId) fail('creation_revision_target_changed');
  return receipt;
}
function clearReservation(job, receipt) {
  if (!receipt) {
    if (readdirSync(job.target).length) fail('creation_revision_target_changed');
    return;
  }
  // On recovery a subset may already be removed. Extra or modified bytes always block.
  const actual = manifest(job.target), files = new Map(receipt.files.map(file => [file.path, file.hash.replace(/^sha256:/, '')]));
  const dirs = new Set([...files.keys()].flatMap(file => { const parts = file.split('/'); return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/')); }));
  for (const entry of actual) if (entry.kind === 'file' ? files.get(entry.path) !== entry.hash : !dirs.has(entry.path)) fail('creation_revision_target_changed');
  for (const entry of actual.filter(item => item.kind === 'file')) unlinkSync(path.join(job.target, entry.path));
  for (const entry of actual.filter(item => item.kind === 'directory').sort((a, b) => b.path.length - a.path.length)) rmdirSync(path.join(job.target, entry.path));
}
function seedContract(job, generation) {
  if (!job.contract?.text) fail('creation_revision_contract_required');
  let text = job.contract.text.replace(/^(status:\s*).*$/m, '$1draft').replace(/^- Build token budget confirmation: user$/m, '- Build token budget confirmation: pending').replace(/^Status:.*$/m, 'Status: draft');
  const fm = parseFrontmatterData(text);
  if (!fm?.id || fm.type !== 'agent-contract') fail('creation_revision_contract_required');
  const id = `${String(fm.id).replace(/-revision-\d+$/, '')}-revision-${generation}`;
  text = text.replace(/^id:.*$/m, `id: ${id}`).replace(/^creation_generation:.*\n/m, '');
  text = text.replace(/^---\r?\n/, `---\ncreation_generation: ${generation}\n`);
  // Init's old request fingerprint is not authority for the new authored proposal.
  text = text.replace(/^init_request_fingerprint:.*$/m, 'init_request_fingerprint: legacy');
  const file = path.join(job.draftRoot, 'contracts', creationCanonicalFilename({ generation }, job.contract.path));
  return { path: file, hash: digest(text), text, issues: [] };
}
function archiveDrafts(job, receipt) {
  const history = creationHostDirectory(job.draftRoot, 'history');
  const archive = creationHostDirectory(history, `revision-${receipt.fromGeneration}`);
  const tops = [...new Set(receipt.drafts.map(entry => entry.path.split('/')[0]))];
  for (const top of tops) {
    const source = path.join(job.draftRoot, top), destination = path.join(archive, top);
    const expected = receipt.drafts.filter(entry => entry.path === top || entry.path.startsWith(`${top}/`));
    const check = base => {
      const all = lstatSync(base).isDirectory() ? [{ path: top, kind: 'directory' }, ...manifest(base).map(entry => ({ ...entry, path: `${top}/${entry.path}` }))]
        : [{ path: top, kind: 'file', hash: digest(bounded(base, job.draftRoot).buffer) }];
      if (JSON.stringify(all) !== JSON.stringify(expected)) fail('creation_revision_drafts_changed');
    };
    if (existsSync(destination)) {
      check(destination);
      if (existsSync(source)) {
        directory(source);
        const remaining = readdirSync(source);
        if (top !== 'contracts' || remaining.length && !(remaining.length === 1 && existsSync(receipt.seed.path) && read(receipt.seed.path, job.draftRoot) === receipt.seed.text)) fail('creation_revision_drafts_changed');
      }
    }
    else { if (!existsSync(source)) fail('creation_revision_drafts_changed'); check(source); renameSync(source, destination); }
  }
  assertSameManifest(archive, receipt.drafts);
  const remainder = manifest(job.draftRoot, new Set(['history']));
  const allowed = [{ path: 'contracts', kind: 'directory' }, { path: path.relative(job.draftRoot, receipt.seed.path), kind: 'file', hash: receipt.seed.hash }];
  if (remainder.length && JSON.stringify(remainder) !== JSON.stringify(allowed) && JSON.stringify(remainder) !== JSON.stringify(allowed.slice(0, 1))) fail('creation_revision_drafts_changed');
}
/** Explicit host action; canonical approvals are never rewritten or superseded in place. */
export function reviseCreationProposal(job, request, options) {
  if (process.env.PRITHA_AGENT_AUTHORING_ROOT) fail('creation_revision_requires_host');
  const reason = String(request.reason || '').trim();
  if (request.action !== 'revise_proposal' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(request.requestId || '') || !Number.isSafeInteger(request.expectedRevision)
    || !reason || reason.length > 2000 || !['user', 'codex-operator'].includes(request.actor || 'user')
    || request.actor === 'codex-operator' && !String(request.authorizationBasis || '').trim()) fail('creation_revision_request_invalid');
  const audit = paths(job, options);
  creationHostDirectory(options.stateRoot, 'audit', 'creation-revisions', job.jobId);
  return withFileLock(path.join(audit, 'operation'), () => options.coordination.transaction(() => {
    quiescent(job, request, options.coordination);
    assertBeforeScaffold(job, options);
    const hash = digest(JSON.stringify(request));
    const existing = readdirSync(audit).filter(name => /^revision-\d+\.json$/.test(name)).map(name => ({ file: path.join(audit, name), receipt: receiptAt(path.join(audit, name), job, options) }));
    let record = existing.find(item => item.receipt.request.requestId === request.requestId);
    if (record && record.receipt.requestHash !== hash) fail('idempotency_conflict');
    if (existing.some(item => item !== record && (item.receipt.status !== 'completed' || item.receipt.toGeneration > creationGeneration(job)))) fail('creation_revision_incomplete');
    if (!record) {
      if (request.expectedRevision !== job.revision || creationGeneration(job) >= 100) fail('creation_revision_stale');
      const reconciled = reconcileCreationArtifacts(job, options);
      if (reconciled.blocker && /^creation_(?:approved_document|approval_|canonical_|contract_approval_|outcome_host_receipt)/.test(reconciled.blocker.code)) fail(reconciled.blocker.code);
      const fromGeneration = creationGeneration(job), toGeneration = fromGeneration + 1;
      const archive = path.join(job.draftRoot, 'history', `revision-${fromGeneration}`);
      if (existsSync(archive)) fail('creation_revision_history_exists');
      directory(job.draftRoot);
      const receipt = { schema: 'pritha-creation-revision-v1', status: 'prepared', jobId: job.jobId, chatId: job.chatId, instanceId: job.instanceId,
        target: job.target, draftRoot: job.draftRoot, releaseSha: job.releaseSha, request, requestHash: hash, fromGeneration, toGeneration,
        oldJob: structuredClone(job), drafts: manifest(job.draftRoot, new Set(['history'])), reservation: targetReservation(job, options), seed: seedContract(reconciled, toGeneration), createdAt: new Date().toISOString() };
      record = { file: path.join(audit, `revision-${toGeneration}.json`), receipt };
      atomicWriteFile(record.file, JSON.stringify(receipt));
      options.onRevisionCheckpoint?.('intent_recorded');
    }
    const receipt = record.receipt;
    if (![receipt.fromGeneration, receipt.toGeneration].includes(creationGeneration(job))) fail('creation_revision_stale');
    if (receipt.status !== 'completed') {
      archiveDrafts(job, receipt);
      options.onRevisionCheckpoint?.('drafts_archived');
      clearReservation(job, receipt.reservation);
      options.onRevisionCheckpoint?.('verifier_cleared');
      creationHostDirectory(job.draftRoot, 'contracts');
      if (existsSync(receipt.seed.path) && read(receipt.seed.path, job.draftRoot) !== receipt.seed.text) fail('creation_revision_drafts_changed');
      atomicWriteFile(receipt.seed.path, receipt.seed.text);
      options.onRevisionCheckpoint?.('seed_written');
      receipt.status = 'completed'; receipt.completedAt = new Date().toISOString();
      atomicWriteFile(record.file, JSON.stringify(receipt));
      options.onRevisionCheckpoint?.('receipt_completed');
    }
    if (creationGeneration(job) === receipt.toGeneration) return job;
    assertSameManifest(path.join(job.draftRoot, 'history', `revision-${receipt.fromGeneration}`), receipt.drafts);
    if (read(receipt.seed.path, job.draftRoot) !== receipt.seed.text || readdirSync(job.target).length) fail('creation_revision_completed_state_changed');
    for (const kind of ['contract', 'outcome']) {
      if (receipt.oldJob.approvals?.[kind] && digest(read(receipt.oldJob[kind].path, options.stateRoot)) !== receipt.oldJob.approvals[kind].hash) fail('creation_approved_document_changed');
    }
    // Keep accounting, native binding, release and reserved target; only the current proposal changes.
    const next = { ...structuredClone(job), generation: receipt.toGeneration, revisionInstruction: reason, revisionRequestId: request.requestId,
      contract: receipt.seed, outcome: null, approvals: {}, researchReady: false, researchAttemptCompleted: false, scaffoldReady: false,
      proposalRevisionPending: true, phase: 'contract', status: 'pending', autoContinue: true, checkpoint: null, blocker: null, preflightWarnings: [], preflight: null };
    delete next.researchReceipt; delete next.scaffoldReceipt;
    return next;
  }));
}
