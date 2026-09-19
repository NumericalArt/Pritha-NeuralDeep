import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile, withFileLock } from '../lib/atomic-file.mjs';
import { readBoundedRegularFile } from '../lib/safe-file-read.mjs';
import { parseFrontmatterData } from '../lib/frontmatter.mjs';
import { markdownDocumentLock } from '../lib/markdown-content-lock.mjs';
import { contractData } from '../agents-mother/contract.mjs';
import { researchGateDecisionForReport, reportReferencesContract } from '../agents-mother/research-gate.mjs';
import { rebindPatternPackContract } from '../agents-mother/pattern-research.mjs';
import { newestArtifactPathsFirst } from '../agents-mother/artifact-selection.mjs';
import { creationGenerationSuffix } from './creation-generation.mjs';
import { AgentCreationError } from './agent-creation-store.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const read = (file, root) => readBoundedRegularFile(file, { allowedRoots: [root], maxBytes: 1_000_000 }).text;
export function creationHostDirectory(stateRoot, ...parts) {
  let directory = path.resolve(stateRoot);
  for (const part of ['', ...parts]) {
    directory = path.join(directory, part);
    if (!existsSync(directory)) mkdirSync(directory, { mode: 0o700 });
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new AgentCreationError('creation_document_boundary');
  }
  return directory;
}
function blocked(reasons, status = 'pending') {
  const error = new AgentCreationError('creation_research_gate_blocked', `Research gate ${status}: ${reasons.join(', ')}`);
  error.reasons = reasons;
  error.gateStatus = status;
  return error;
}
function sourceCommit(options) {
  let revision;
  try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: options.sourceRoot || options.root, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { throw new AgentCreationError('creation_research_source_revision_unavailable'); }
  if (options.sourceRevision && options.sourceRevision !== revision) throw new AgentCreationError('creation_research_source_revision_changed');
  return revision;
}
const replaceReference = (text, from, to) => {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(?<![\\p{L}\\p{N}_./-])${escaped}(?![\\p{L}\\p{N}_./-])`, 'gu'), () => to);
};

/** Only valid complete research can cross the draft/host boundary. The source is immutable. */
export function promoteCreationResearch(job, options) {
  const sourceRoot = path.resolve(options.sourceRoot || options.root);
  const expectedDraft = path.join(path.resolve(options.stateRoot), 'creation-drafts', job.jobId);
  if (!/^creation_[a-f0-9]{24}$/.test(job.jobId) || path.resolve(job.draftRoot) !== expectedDraft) throw new AgentCreationError('creation_research_identity');
  if (path.dirname(path.resolve(job.contract.path)) !== path.join(path.resolve(options.stateRoot), 'agents', 'contracts')) throw new AgentCreationError('creation_research_identity');
  const contractBytes = read(job.contract.path, options.stateRoot);
  const contract = contractData(job.contract.path, { root: sourceRoot });
  if (contract.text !== contractBytes || (contract.technicalSlug || contract.agentId) !== job.agentId
    || digest(read(contract.fullPath, options.stateRoot)) !== job.approvals.contract.hash) throw new AgentCreationError('creation_research_identity');
  const researchRoot = path.join(job.draftRoot, 'research');
  if (!existsSync(researchRoot)) throw blocked(['research_report_missing']);
  if (!lstatSync(researchRoot).isDirectory() || lstatSync(researchRoot).isSymbolicLink()) throw new AgentCreationError('creation_document_boundary');
  const entries = readdirSync(researchRoot, { withFileTypes: true });
  if (entries.length > 150) throw new AgentCreationError('creation_documents_limit');
  const candidates = entries.filter(entry => entry.isFile() && entry.name.endsWith('.md')).map(entry => {
    const file = path.join(researchRoot, entry.name), text = read(file, job.draftRoot), fm = parseFrontmatterData(text) || {};
    return { file, text, fm, modified: lstatSync(file).mtimeMs };
  }).filter(item => item.fm.type === 'review' && item.fm.status !== 'superseded' && item.fm.research_gate_status !== undefined
    && reportReferencesContract(item.text, contract).ok && item.fm.contract_fingerprint === contract.fingerprint)
    .sort((a, b) => b.modified - a.modified || b.file.localeCompare(a.file));
  if (!candidates.length) throw blocked(['research_report_contract_or_fingerprint_missing']);
  // A newer failed attempt must not silently fall back to old passing evidence.
  const newest = newestArtifactPathsFirst(candidates.map(item => item.file))[0];
  const original = candidates.find(item => item.file === newest);
  const patternFile = path.resolve(sourceRoot, original.fm.pattern_pack || '');
  if (path.dirname(patternFile) !== researchRoot) throw blocked(['pattern_pack_path_outside_job_research']);
  if (!existsSync(patternFile)) throw blocked(['pattern_pack_missing']);
  const patternText = read(patternFile, job.draftRoot);
  const gate = researchGateDecisionForReport(contract, original.text, { stateRoot: options.stateRoot, canonical: true, artifactRoots: [job.draftRoot], patternPackSnapshot: { path: patternFile, text: patternText } });
  if (!gate.ok) throw blocked(gate.reasons, gate.status);
  const revision = sourceCommit(options);
  const canonical = contractData(contract.fullPath, { root: options.root });
  const reboundPattern = rebindPatternPackContract(patternText, contract.fingerprint, contract.relPath, canonical.relPath);
  const destination = creationHostDirectory(options.stateRoot, 'agents', 'research');
  const audit = creationHostDirectory(options.stateRoot, 'audit', 'creation-research');
  const receiptPath = path.join(audit, `${job.jobId}${creationGenerationSuffix(job)}.json`);
  return withFileLock(receiptPath, () => {
    const promotedPattern = path.join(destination, `${job.jobId}-agent-pattern-pack${creationGenerationSuffix(job)}.md`);
    const promotedReport = path.join(destination, `${job.jobId}-agent-research${creationGenerationSuffix(job)}.md`);
    let reportText = replaceReference(original.text, contract.relPath, canonical.relPath);
    reportText = replaceReference(reportText, original.fm.pattern_pack, path.relative(options.root, promotedPattern));
    reportText = reportText.replace(/^pattern_pack_lock:.*$/m, `pattern_pack_lock: ${reboundPattern.lock}`);
    reportText = reportText.replace(/^research_content_lock:.*$/m, `research_content_lock: ${markdownDocumentLock(reportText)}`);
    const relocatedGate = researchGateDecisionForReport(canonical, reportText, { stateRoot: options.stateRoot, canonical: true,
      patternPackSnapshot: { path: promotedPattern, text: reboundPattern.text } });
    if (!relocatedGate.ok) throw blocked(relocatedGate.reasons, relocatedGate.status);
    const identity = { jobId: job.jobId, instanceId: job.instanceId, agentId: job.agentId, contract: contract.fullPath, contractHash: job.approvals.contract.hash };
    let previous = null;
    if (existsSync(receiptPath)) {
      previous = JSON.parse(read(receiptPath, options.stateRoot));
      if (JSON.stringify(previous.identity) !== JSON.stringify(identity)) throw new AgentCreationError('creation_research_receipt_mismatch');
    }
    for (const [file, content, kind] of [[promotedPattern, reboundPattern.text, 'pattern'], [promotedReport, reportText, 'report']]) {
      if (existsSync(file) && read(file, options.stateRoot) !== content && (!previous || digest(read(file, options.stateRoot)) !== previous.promoted[kind].hash)) {
        throw new AgentCreationError('creation_research_destination_changed');
      }
    }
    // Preserve the exact source proof before relocating; retries keep previous revisions.
    const sourceHash = digest(original.text + '\0' + patternText);
    const sourceArchive = creationHostDirectory(options.stateRoot, 'audit', 'creation-research', job.jobId);
    atomicWriteFile(path.join(sourceArchive, `${sourceHash}.json`), JSON.stringify({ report: original.text, pattern: patternText, sourceRoot, sourceRevision: revision }, null, 2));
    atomicWriteFile(promotedPattern, reboundPattern.text);
    atomicWriteFile(promotedReport, reportText);
    const receipt = { schema: 'pritha-creation-research-promotion-v1', identity, sourceRoot, sourceRevision: revision,
      original: { report: { path: original.file, hash: digest(original.text) }, pattern: { path: patternFile, hash: digest(patternText) } },
      promoted: { report: { path: promotedReport, hash: digest(reportText) }, pattern: { path: promotedPattern, hash: digest(reboundPattern.text) } },
      at: new Date().toISOString() };
    atomicWriteFile(receiptPath, JSON.stringify(receipt, null, 2));
    return { ...receipt, receiptPath, gate: relocatedGate };
  });
}
