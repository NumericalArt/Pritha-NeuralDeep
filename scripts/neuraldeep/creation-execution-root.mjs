import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { NeuralDeepExecutionWorkspaces } from './execution-workspaces.mjs';
import { workspaceRevision } from '../agents-mother/workspace-revision.mjs';

function directory(value) {
  if (!value || !path.isAbsolute(value) || lstatSync(value).isSymbolicLink() || !lstatSync(value).isDirectory()) throw new Error('execution_code_root_unverified');
  return realpathSync(value);
}

function assertProposalGeneration(store, chatId, intent, job) {
  // Only omitted generations use the legacy first proposal. Malformed values
  // must not turn a stale launch into a generation-one launch.
  const expected = intent.creationGeneration === undefined ? 1 : intent.creationGeneration;
  const current = job?.generation === undefined ? 1 : job.generation;
  if (!job || !Number.isSafeInteger(expected) || expected < 1 || !Number.isSafeInteger(current) || current < 1
    || expected !== current || store.db.prepare("SELECT 1 FROM agent_creation_actions WHERE chat_id=? AND status='started' AND json_extract(request,'$.action')='revise_proposal'").get(chatId)) throw new Error();
}

/** Only a live host lease can separate authoring cwd from the pinned read-only code. */
export async function assertCreationExecutionRoot(store, runtime, options, environment = process.env) {
  const configured = environment.PRITHA_AGENT_AUTHORING_ROOT;
  if (!configured) {
    let linked;
    try { linked = JSON.parse(environment.PRITHA_NEURALDEEP_ADMISSION_RECEIPT || '{}'); } catch {}
    const attempt = linked?.attemptId ? store.get(linked.attemptId) : null;
    if (attempt?.payload?.execution?.agentCreationRequested && store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='agent_creation_jobs'").get()
      && store.db.prepare('SELECT 1 FROM agent_creation_jobs WHERE chat_id=?').get(attempt.payload.chatId)) throw new Error('execution_code_root_unverified');
    if (options.executionCodeRoot && ![path.resolve(runtime.projectRoot), path.resolve(options.cwd || runtime.projectRoot)].includes(path.resolve(options.executionCodeRoot))) throw new Error('execution_code_root_unverified');
    return;
  }
  try {
    const linked = JSON.parse(environment.PRITHA_NEURALDEEP_ADMISSION_RECEIPT || '{}');
    const attempt = store.get(linked.attemptId);
    if (!linked.ownerToken || attempt?.status !== 'active' || attempt.ownerToken !== linked.ownerToken || attempt.surface !== 'task_chat'
      || attempt.workloadId !== options.workloadId || attempt.payload?.turnId !== options.workloadId) throw new Error();
    const intent = attempt.payload.execution, chatId = attempt.payload.chatId;
    const row = store.db.prepare('SELECT record FROM agent_creation_jobs WHERE chat_id=?').get(chatId);
    const job = row && JSON.parse(row.record);
    if (!job || job.status !== 'running' || job.activeTurnId !== options.workloadId || !/^creation_[a-f0-9]{24}$/.test(job.jobId)
      || !['interview', 'contract', 'outcome', 'research'].includes(job.phase)
      || intent?.attemptId !== linked.attemptId || intent.agentCreationRequested !== true || intent.executionAgentTarget !== job.target
      || options.sandbox !== 'workspace-write' || intent.sandbox !== options.sandbox || options.model !== intent.modelId
      || String(options.effort || 'none') !== String(intent.effortId || 'none')) throw new Error();
    assertProposalGeneration(store, chatId, intent, job);
    if (intent.creationSession && (intent.creationSession.mode !== 'checkpoint'
      || !/^[a-f0-9]{64}$/.test(intent.creationSession.contextHash || '')
      || (intent.creationSession.previousSessionId !== null && !/^[A-Za-z0-9._:-]{1,160}$/.test(intent.creationSession.previousSessionId || ''))
      || options.resume)) throw new Error();
    const draft = directory(configured), code = directory(options.executionCodeRoot);
    const expectedDraft = path.join(directory(runtime.stateRoot), 'creation-drafts', job.jobId);
    if (draft !== expectedDraft || directory(job.draftRoot) !== draft || directory(options.cwd) !== draft || directory(intent.cwd) !== draft
      || directory(intent.executionCodeRoot) !== code || code === draft || code.startsWith(`${draft}${path.sep}`)) throw new Error();
    const roots = options.addDirs || [];
    if (!Array.isArray(roots) || roots.some(value => directory(value) !== draft)
      || !Array.isArray(intent.additionalWritableDirs) || intent.additionalWritableDirs.some(value => directory(value) !== draft)) throw new Error();
    const records = store.db.prepare("SELECT record FROM execution_workspaces WHERE json_extract(record,'$.cwd')=?").all(code);
    if (records.length !== 1) throw new Error();
    const record = JSON.parse(records[0].record);
    if (record.mode !== 'worktree' || directory(record.source) !== directory(runtime.projectRoot)
      || record.expectedCommit !== job.releaseSha || record.baseCommit !== job.releaseSha) throw new Error();
    await NeuralDeepExecutionWorkspaces.prototype.verify.call(null, record);
    const revision = workspaceRevision(code, { requireComplete: true });
    if (revision.kind !== 'git' || revision.dirty || revision.head !== job.releaseSha) throw new Error();
    // Verification awaits Git, so check the durable fence again after that gap.
    const latest = store.db.prepare('SELECT record FROM agent_creation_jobs WHERE chat_id=?').get(chatId);
    assertProposalGeneration(store, chatId, intent, latest && JSON.parse(latest.record));
    return { chatId, jobId: job.jobId, releaseSha: job.releaseSha, generation: job.generation ?? 1 };
  } catch {
    throw new Error('execution_code_root_unverified');
  }
}
