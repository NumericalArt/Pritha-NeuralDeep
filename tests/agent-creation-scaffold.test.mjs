import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { contractData } from '../scripts/agents-mother/contract.mjs';
import { createOutcomeSpec, approveOutcomeSpec } from '../scripts/agents-mother/outcome-spec.mjs';
import { patternPackMarkdown, verifyPatternPackIntegrity } from '../scripts/agents-mother/pattern-research.mjs';
import { deriveExternalResearchTopics } from '../scripts/agents-mother/external-research-topics.mjs';
import { applyExternalResearchEvidence } from '../scripts/agents-mother/external-research.mjs';
import { researchGateDecisionForReport } from '../scripts/agents-mother/research-gate.mjs';
import { markdownDocumentLock } from '../scripts/lib/markdown-content-lock.mjs';
import { promoteCreationResearch } from '../scripts/neuraldeep/creation-research.mjs';
import { runCreationScaffoldStep } from '../scripts/neuraldeep/creation-scaffold.mjs';

const digest = text => createHash('sha256').update(text).digest('hex');
const repo = path.resolve('.');
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function fixture(t, { fullEvidence = false } = {}) {
  const temp = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'pritha-creation-scaffold-')));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'code'), stateRoot = path.join(temp, 'state'), sourceRoot = path.join(temp, 'execution', 'worktrees', 'job');
  const target = path.join(temp, 'children', 'alpha'), jobId = `creation_${'a'.repeat(24)}`, draftRoot = path.join(stateRoot, 'creation-drafts', jobId);
  for (const directory of [root, sourceRoot, path.dirname(target), path.join(stateRoot, 'agents', 'contracts'), path.join(draftRoot, 'research')]) mkdirSync(directory, { recursive: true });
  git(sourceRoot, 'init'); git(sourceRoot, 'commit', '--allow-empty', '-m', 'Source fixture');
  const options = { root, stateRoot, sourceRoot, sourceRevision: git(sourceRoot, 'rev-parse', 'HEAD'), agentParent: path.dirname(target) };
  const contractPath = path.join(stateRoot, 'agents', 'contracts', 'alpha-contract.md');
  let contract = readFileSync(path.join(repo, 'tests/fixtures/contracts/valid-agent-contract.md'), 'utf8')
    .replace('type: agent-contract', 'type: agent-contract\ncontract_schema_version: 2\nagent_kind: service');
  for (const [label, value] of Object.entries({ 'Agent name': 'Alpha', 'Runtime family': 'api', 'Primary interface': 'web', 'Secondary interfaces': 'API', 'Service mode': 'process', 'Autostart': 'optional', 'Proactive mode': 'none', 'Target folder': target })) {
    contract = contract.replace(new RegExp(`^- ${label}:.*$`, 'm'), `- ${label}: ${value}`);
  }
  contract = contract.replace('- Agent name: Alpha', '- Agent name: Alpha\n- Technical slug: alpha');
  writeFileSync(contractPath, contract);
  const spec = createOutcomeSpec(contractPath, options);
  approveOutcomeSpec(spec.path, { ...options, approvedBy: 'user' });
  const outcomeText = readFileSync(spec.path, 'utf8');
  const job = { jobId, instanceId: 'fixture-instance', chatId: 'fixture-chat', agentId: 'alpha', target, draftRoot, releaseSha: options.sourceRevision,
    contract: { path: contractPath, hash: digest(contract) }, outcome: { path: spec.path, hash: digest(outcomeText) },
    approvals: { contract: { hash: digest(contract) }, outcome: { hash: digest(outcomeText) } }, status: 'pending', phase: 'research' };
  const source = contractData(contractPath, { root: sourceRoot });
  const pattern = patternPackMarkdown(source, { memoryResults: [{ path: '04_standards/fixture.md', title: 'Bounded fixture', snippet: 'Use explicit boundaries.', type: 'standard', status: 'accepted' }] });
  const patternPath = path.join(draftRoot, 'research', 'alpha-pattern.md');
  writeFileSync(patternPath, pattern.text);
  const topics = deriveExternalResearchTopics(source, { patternPack: { externalResearchSeeds: verifyPatternPackIntegrity(pattern.text).payload.external_research_seeds } });
  let report = `---\nid: alpha-research\ntype: review\nstatus: draft\nresearch_gate_status: complete\nmemory_research_status: complete\nexternal_research_status: not-applicable\nsynthesis_status: not-applicable\ncontract_fingerprint: ${source.fingerprint}\npattern_pack: ${JSON.stringify(path.relative(sourceRoot, patternPath))}\npattern_pack_lock: ${pattern.lock}\npattern_pack_contract_fingerprint: ${source.fingerprint}\nexternal_research_topics: ${JSON.stringify(topics.map(topic => topic.id))}\nresearch_content_lock: pending\nsources:\n  - ${JSON.stringify(source.relPath)}\nrelated:\n  agent_contracts:\n    - ${JSON.stringify(source.relPath)}\n---\n\n# Fixture research\n\nContract: ${source.relPath}\n`;
  report = report.replace(/^research_content_lock:.*$/m, `research_content_lock: ${markdownDocumentLock(report)}`);
  let evidence;
  if (fullEvidence) {
    const now = new Date().toISOString();
    evidence = { backend: 'manual', completed_at: now,
      items: topics.map(topic => ({ topic_id: topic.id, source_url: `https://example.test/official/${topic.id}`, source_type: 'official-docs', source_updated: now,
        retrieved_at: now, claim: 'The current official documentation confirms the bounded fixture runtime configuration.', confidence: 'high' })),
      synthesis: { relationship: 'confirms', memory_comparison: 'Current documentation confirms the bounded local runtime guidance.',
        summary: 'The local runtime and explicit verification boundaries remain suitable for the requested fixture.',
        architecture_decision: 'Retain the bounded process adapter and independent host verifiers.', alternatives: ['Defer implementation'], tradeoffs: ['More verification effort'] },
    };
    report = applyExternalResearchEvidence(report, source, evidence, { topics }).text;
  }
  const reportPath = path.join(draftRoot, 'research', 'alpha-research.md'); writeFileSync(reportPath, report);
  const gate = researchGateDecisionForReport(source, report, { stateRoot, artifactRoots: [draftRoot] });
  assert.equal(gate.ok, true, gate.reasons.join(', '));
  let calls = [];
  const run = async args => {
    calls.push(args);
    const result = spawnSync(process.execPath, [path.join(repo, 'scripts/agents-mother.mjs'), ...args], { cwd: root, env: { ...process.env, TECHSCOPE_ROOT: root, PRITHA_STATE_ROOT: stateRoot, PRITHA_AGENT_PARENT: options.agentParent, PRITHA_AGENT_AUTHORING_ROOT: '' }, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout;
  };
  return { ...options, options, job, reportPath, report, patternPath, pattern, evidence, run, calls };
}

test('research relocation verifies original locks, rewrites only bindings and preserves source proof', t => {
  const f = fixture(t, { fullEvidence: true }), result = promoteCreationResearch(f.job, f.options);
  assert.equal(result.gate.ok, true);
  const data = contractData(f.job.contract.path, { root: f.root });
  const promoted = readFileSync(result.promoted.report.path, 'utf8');
  assert.equal(researchGateDecisionForReport(data, promoted, { stateRoot: f.stateRoot }).ok, true);
  assert.equal(readFileSync(f.reportPath, 'utf8'), f.report);
  assert.equal(readFileSync(f.patternPath, 'utf8'), f.pattern.text);
  assert.equal(result.original.report.hash, digest(f.report));
  assert.equal(result.sourceRevision, f.options.sourceRevision);
  assert.notEqual(result.original.report.hash, result.promoted.report.hash);
  assert.equal(promoteCreationResearch(f.job, f.options).promoted.report.path, result.promoted.report.path);
  writeFileSync(result.promoted.report.path, promoted + '\nUnreviewed canonical change.');
  assert.throws(() => promoteCreationResearch(f.job, f.options), /creation_research_destination_changed/);
});

test('missing, stale or tampered research yields exact gate blocker and no scaffold or promotion', async t => {
  for (const mutation of ['missing', 'tampered', 'pending', 'foreign-contract', 'pattern-tampered']) {
    const f = fixture(t);
    if (mutation === 'missing') rmSync(f.reportPath);
    if (mutation === 'tampered') writeFileSync(f.reportPath, f.report + '\nUnverified addition.');
    if (mutation === 'pending') {
      let text = f.report.replace('external_research_status: not-applicable', 'external_research_status: pending');
      text = text.replace(/^research_content_lock:.*$/m, `research_content_lock: ${markdownDocumentLock(text)}`); writeFileSync(f.reportPath, text);
    }
    if (mutation === 'foreign-contract') writeFileSync(f.reportPath, f.report.replaceAll('alpha-contract.md', 'another-contract.md'));
    if (mutation === 'pattern-tampered') writeFileSync(f.patternPath, f.pattern.text + '\nInjected claim.');
    await assert.rejects(runCreationScaffoldStep(f.job, f.options, f.run), error => error.code === 'creation_research_gate_blocked'
      && error.reasons.some(reason => /missing|mismatch|pending/.test(reason)), mutation);
    assert.equal(f.calls.length, 0);
    assert.equal(existsSync(path.join(f.stateRoot, 'agents', 'research')), false);
    assert.equal(existsSync(f.job.target), false);
  }
});

test('a failed registry rebuild resumes the exact clean completed scaffold without recreating it', async t => {
  const f = fixture(t);
  await assert.rejects(runCreationScaffoldStep(f.job, f.options, async args => {
    if (args[0] === 'registry') throw new Error('registry temporarily unavailable');
    return f.run(args);
  }), /registry temporarily unavailable/);
  const head = git(f.job.target, 'rev-parse', 'HEAD');
  const resumed = await runCreationScaffoldStep(f.job, f.options, f.run);
  assert.equal(resumed.scaffoldReceipt.revision, head);
  assert.equal(resumed.phase, 'implement');
  assert.equal(f.calls.filter(args => args[0] === 'scaffold').length, 1);
  assert.equal(f.calls.some(args => args.some(value => /allow-(missing|pending|draft)/.test(value))), false);
  writeFileSync(path.join(f.job.target, 'user-notes.md'), 'Keep this user work.');
  await assert.rejects(runCreationScaffoldStep(f.job, f.options, f.run), /creation_scaffold_target_changed/);
  assert.equal(readFileSync(path.join(f.job.target, 'user-notes.md'), 'utf8'), 'Keep this user work.');
});

test('crash after scaffold before the completion receipt recovers from exact host report and lineage', async t => {
  const f = fixture(t);
  await assert.rejects(runCreationScaffoldStep(f.job, f.options, async args => {
    await f.run(args); throw new Error('host crashed after command');
  }), /host crashed after command/);
  const head = git(f.job.target, 'rev-parse', 'HEAD');
  const next = await runCreationScaffoldStep(f.job, f.options, f.run);
  assert.equal(next.scaffoldReceipt.revision, head);
  assert.equal(f.calls.filter(args => args[0] === 'scaffold').length, 1);
});

test('authoring CLI accepts evidence only in its own draft/root and evaluates its isolated pattern pack', t => {
  const f = fixture(t, { fullEvidence: true });
  const input = path.join(f.job.draftRoot, 'evidence.json'), outside = path.join(f.stateRoot, 'other-evidence.json');
  writeFileSync(input, JSON.stringify(f.evidence)); writeFileSync(outside, JSON.stringify(f.evidence));
  const link = path.join(f.job.draftRoot, 'evidence-link.json'); symlinkSync(outside, link);
  const run = file => spawnSync(process.execPath, [path.join(repo, 'scripts/agents-mother.mjs'), 'external-research', f.job.contract.path, '--backend', 'manual', '--input', file], {
    cwd: f.sourceRoot, env: { ...process.env, TECHSCOPE_ROOT: f.sourceRoot, PRITHA_STATE_ROOT: f.stateRoot, PRITHA_AGENT_AUTHORING_ROOT: f.job.draftRoot }, encoding: 'utf8', timeout: 10000,
  });
  const permitted = run(input);
  assert.equal(permitted.status, 0, permitted.stdout + permitted.stderr);
  assert.match(permitted.stdout, /Research gate: complete/);
  for (const file of [outside, link]) {
    const denied = run(file);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /Evidence input is missing, unsafe/);
  }
});
