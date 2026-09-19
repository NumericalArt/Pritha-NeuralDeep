import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { acquireFileLock, atomicWriteFile } from '../lib/atomic-file.mjs';
import { readBoundedRegularFile } from '../lib/safe-file-read.mjs';
import { parseFrontmatterData } from '../lib/frontmatter.mjs';
import { contractData } from '../agents-mother/contract.mjs';
import { outcomeSpecFile, verifyOutcomeApproval } from '../agents-mother/outcome-spec.mjs';
import { workspaceRevision } from '../agents-mother/workspace-revision.mjs';
import { reportReferencesContract } from '../agents-mother/research-gate.mjs';
import { creationHostDirectory, promoteCreationResearch } from './creation-research.mjs';
import { AgentCreationError } from './agent-creation-store.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const read = (file, root) => readBoundedRegularFile(file, { allowedRoots: [root], maxBytes: 1_000_000 }).text;
function exactBaseline(job, options, expectedRevision) {
  if (!existsSync(path.join(job.target, '.git'))) return null;
  let revision;
  try { revision = workspaceRevision(job.target, { requireComplete: true }); }
  catch { throw new AgentCreationError('creation_scaffold_baseline_unreadable'); }
  if (revision.kind !== 'git' || revision.dirty || (expectedRevision && revision.head !== expectedRevision)) throw new AgentCreationError('creation_scaffold_target_changed');
  const data = contractData(job.contract.path, { root: options.root });
  const outcome = outcomeSpecFile(job.outcome.path, options);
  const fm = outcome.parsed.frontmatter;
  const lineage = JSON.parse(read(path.join(job.target, 'delivery', 'outcome-lineage.json'), job.target));
  if (lineage.schema !== 'pritha-child-outcome-lineage-v1' || lineage.contract_fingerprint !== data.fingerprint
    || lineage.outcome_spec_id !== fm.id || path.resolve(options.root, lineage.outcome_spec_path || '') !== path.resolve(job.outcome.path)
    || lineage.outcome_semantic_lock !== fm.outcome_semantic_lock || lineage.outcome_document_lock !== fm.outcome_document_lock
    || lineage.approval_evidence_valid !== true) throw new AgentCreationError('creation_scaffold_lineage_mismatch');
  const directory = path.join(options.stateRoot, 'agents', 'reports');
  const files = existsSync(directory) ? readdirSync(directory, { withFileTypes: true }) : [];
  if (files.length > 10000) throw new AgentCreationError('creation_scaffold_reports_limit');
  const reports = files.filter(file => file.isFile() && file.name.endsWith('.md')).map(file => {
    const fullPath = path.join(directory, file.name), content = read(fullPath, options.stateRoot);
    return { path: fullPath, hash: digest(content), fm: parseFrontmatterData(content) || {}, content };
  }).filter(item => item.fm.type === 'scaffold-report' && item.fm.project_path && path.resolve(options.root, item.fm.project_path) === path.resolve(job.target)
    && item.fm.contract_fingerprint === data.fingerprint && reportReferencesContract(item.content, data).ok
    && item.fm.delivery_git_status === 'initialized' && item.fm.delivery_git_revision === revision.head
    && item.fm.experimental_scaffold === 'false' && item.fm.outcome_approval_evidence === 'valid'
    && item.fm.outcome_spec_id === fm.id && item.fm.outcome_semantic_lock === fm.outcome_semantic_lock && item.fm.outcome_document_lock === fm.outcome_document_lock);
  if (reports.length !== 1) throw new AgentCreationError('creation_scaffold_host_report_missing_or_ambiguous');
  return { revision: revision.head, report: { path: reports[0].path, hash: reports[0].hash } };
}

/** Durable completion precedes registry rebuild, so a failed rebuild never reruns scaffold. */
export async function runCreationScaffoldStep(job, options, runCommand) {
  if (!job.approvals?.contract || !job.approvals?.outcome) throw new AgentCreationError('creation_approval_required');
  for (const kind of ['contract', 'outcome']) {
    if (digest(read(job[kind].path, options.stateRoot)) !== job.approvals[kind].hash) throw new AgentCreationError('creation_approved_document_changed');
  }
  const approval = verifyOutcomeApproval(job.outcome.path, options);
  if (!approval.ok) throw new AgentCreationError('creation_outcome_host_receipt_missing', approval.reasons.join(', '));
  const research = promoteCreationResearch(job, options);
  const directory = creationHostDirectory(options.stateRoot, 'audit', 'creation-scaffolds');
  const file = path.join(directory, `${job.jobId}.json`), lease = acquireFileLock(file);
  try {
    const identity = { jobId: job.jobId, instanceId: job.instanceId, agentId: job.agentId, target: path.resolve(job.target),
      contract: job.contract.path, contractHash: job.approvals.contract.hash, outcome: job.outcome.path,
      outcomeHash: job.approvals.outcome.hash, releaseSha: job.releaseSha };
    let receipt = existsSync(file) ? JSON.parse(read(file, options.stateRoot)) : null;
    if (receipt && (receipt.schema !== 'pritha-creation-scaffold-v1' || JSON.stringify(receipt.identity) !== JSON.stringify(identity))) throw new AgentCreationError('creation_scaffold_receipt_mismatch');
    if (!receipt && existsSync(path.join(job.target, '.git'))) throw new AgentCreationError('creation_scaffold_target_already_exists');
    let baseline = receipt ? exactBaseline(job, options, receipt.revision) : null;
    if (!baseline) {
      if (receipt?.status === 'completed') throw new AgentCreationError('creation_scaffold_target_missing');
      receipt = { schema: 'pritha-creation-scaffold-v1', identity, status: 'started', at: new Date().toISOString(), researchReceipt: research.receiptPath };
      atomicWriteFile(file, JSON.stringify(receipt, null, 2));
      const output = await runCommand(['scaffold', job.contract.path, '--output', job.target]);
      baseline = exactBaseline(job, options);
      if (!baseline) throw new AgentCreationError('creation_scaffold_baseline_missing');
      receipt.output = String(output).slice(-4000);
    }
    if (receipt.status === 'completed' && JSON.stringify(receipt.report) !== JSON.stringify(baseline.report)) throw new AgentCreationError('creation_scaffold_host_report_changed');
    receipt = { ...receipt, ...baseline, status: 'completed', completedAt: receipt.completedAt || new Date().toISOString() };
    atomicWriteFile(file, JSON.stringify(receipt, null, 2));
    await runCommand(['registry']);
    const next = structuredClone(job);
    next.researchReady = true; next.scaffoldReady = true; next.phase = 'implement'; next.status = 'pending'; next.blocker = null;
    next.scaffoldReceipt = { at: receipt.completedAt, revision: receipt.revision, output: receipt.output || '', receiptPath: file, report: receipt.report };
    return next;
  } finally { lease.release(); }
}
