import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { atomicCompareAndSwapFile, atomicWriteFile, withFileLock } from '../lib/atomic-file.mjs';
import { readBoundedRegularFile } from '../lib/safe-file-read.mjs';
import { normalizeInterviewBrief, validateInterviewBrief } from '../agents-mother/interview-brief.mjs';
import { contractData, validateContract } from '../agents-mother/contract.mjs';
import { renderOutcomeSpecFromContract, outcomeSpecFile, validateOutcomeSpecText } from '../agents-mother/outcome-spec.mjs';
import { API_DECLARED_PRESETS, productApiIssues } from '../agents-mother/outcome-verifier-presets.mjs';
import { applyInterviewTechnicalProposal, contractMarkdown, parseInterviewBriefDecisions } from '../agents-mother/interview-proposal.mjs';
import { creationDocumentIdentity, creationGeneration } from './creation-generation.mjs';
import { creationHostDirectory } from './creation-research.mjs';
import { AgentCreationError } from './agent-creation-store.mjs';
import { isCreationClarification } from './creation-dialogue.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const read = (file, root) => readBoundedRegularFile(file, {allowedRoots:[root],maxBytes:512*1024}).text;
const fail = (code, message) => { throw new AgentCreationError(code, message); };

export const CREATION_INTERVIEW_ROUNDS = 3;
const INTERVIEW_QUESTIONS = 5;
/** A fenced JSON block; models also write the JSON on the fence line after "name:" or a space. */
function fencedJsonBlocks(answer, name) {
  return [...String(answer).matchAll(new RegExp('```' + name + '[:\\t ]*(\\{[\\s\\S]*?\\}|\\n[\\s\\S]*?)\\s*```', 'g'))].map(match => match[1].trim());
}
const text = (value, max) => typeof value === 'string' && value.trim() && value.length <= max;

/** Clarifying questions with proposed defaults. Questions never authorize or skip approvals. */
export function readCreationInterview(answer) {
  const blocks = fencedJsonBlocks(answer, 'pritha-interview-json');
  if (!blocks.length) return null;
  if (blocks.length !== 1) return {issues:['Return exactly one pritha-interview-json block.']};
  try {
    const value = JSON.parse(blocks[0]), issues = [];
    if (value?.schemaVersion !== 1) issues.push('pritha-interview-json requires schemaVersion 1.');
    const questions = Array.isArray(value?.questions) ? value.questions : [];
    if (!questions.length || questions.length > INTERVIEW_QUESTIONS) issues.push(`Ask between 1 and ${INTERVIEW_QUESTIONS} questions.`);
    const normalized = questions.slice(0, INTERVIEW_QUESTIONS).map((question, index) => {
      if (!text(question?.question, 600)) issues.push(`questions[${index}].question must be text.`);
      if (!text(question?.why, 600)) issues.push(`questions[${index}].why must explain what the answer changes.`);
      if (!text(question?.default, 600)) issues.push(`questions[${index}].default must propose a default answer.`);
      const options = Array.isArray(question?.options) ? question.options.filter(option => text(option, 200)).slice(0, 6) : [];
      return {id: /^[a-z0-9_-]{1,32}$/i.test(question?.id || '') ? question.id : `q${index + 1}`, question: String(question?.question || ''),
        why: String(question?.why || ''), options, default: String(question?.default || '')};
    });
    const assumptions = Array.isArray(value?.assumptions) ? value.assumptions.filter(item => text(item, 600)).slice(0, 12) : [];
    const draft = text(value?.draft, 4000) ? value.draft : '';
    return issues.length ? {issues} : {interview:{questions:normalized, assumptions, draft}, issues:[]};
  } catch (error) { return {issues:[error.message]}; }
}

/** A product proposal is never an approval or a filesystem instruction. */
export function readCreationBrief(answer, job) {
  const blocks = [...String(answer).matchAll(/```pritha-brief-json\s*\n([\s\S]*?)\n```/g)];
  if (blocks.length !== 1) return {issues:['Return exactly one pritha-brief-json block.']};
  try {
    const value = JSON.parse(blocks[0][1]);
    const issues = validateInterviewBrief(value, {requireComplete:true});
    if (value.identity?.slug && value.identity.slug !== job.agentId) issues.push('identity.slug must equal the host-reserved agent slug.');
    if (value.technical?.targetFolder && path.resolve(value.technical.targetFolder) !== job.target) issues.push('technical.targetFolder must equal the host-reserved target.');
    const brief = normalizeInterviewBrief({...value,identity:{...value.identity,slug:job.agentId}});
    for (const key of ['coreFunctions','workflows']) if (!brief[key].length) issues.push(`${key} must describe the product.`);
    for (const key of ['network','filesystem']) if (!brief.permissions[key].length) issues.push(`permissions.${key} must declare allowed access or none.`);
    if (!brief.permissions.authorization) issues.push('permissions.authorization must describe user authority.');
    if (issues.length) return {issues};
    brief.technical.targetFolder = job.target;
    return {brief,hash:hash(JSON.stringify(brief)),issues:[]};
  } catch(error) { return {issues:[error.message]}; }
}

function operationRoot(job, options) {
  if (process.env.PRITHA_AGENT_AUTHORING_ROOT || job.preparationPolicyVersion !== 2
    || JSON.stringify(job.documentIdentity) !== JSON.stringify(creationDocumentIdentity(job))) fail('creation_preparation_host_required');
  if (path.resolve(job.draftRoot) !== path.join(path.resolve(options.stateRoot),'creation-drafts',job.jobId)) fail('creation_preparation_identity');
  return creationHostDirectory(options.stateRoot,'audit','creation-preparation',job.jobId,`generation-${creationGeneration(job)}`);
}

/** Intent, bytes and destination are durable before publishing. A crash replays these same bytes. */
function publish(job, kind, inputHash, render, options) {
  const directory = operationRoot(job,options);
  const file = path.join(directory,`${kind}-${inputHash}.json`);
  const destination = path.join(job.draftRoot,'contracts',job.documentIdentity[kind]);
  creationHostDirectory(job.draftRoot,'contracts');
  return withFileLock(path.join(directory,kind), () => {
    let receipt;
    if (existsSync(file)) {
      receipt = JSON.parse(read(file,options.stateRoot));
      if (receipt.schema !== 'pritha-creation-host-operation-v1' || receipt.jobId !== job.jobId || receipt.instanceId !== job.instanceId
        || receipt.generation !== creationGeneration(job) || receipt.kind !== kind || receipt.inputHash !== inputHash
        || receipt.releaseSha !== job.releaseSha || receipt.destination !== destination || hash(receipt.text) !== receipt.outputHash
        || !['prepared','completed'].includes(receipt.status)) fail('creation_preparation_receipt_invalid');
    } else {
      if (job.approvals?.[kind]) fail('creation_preparation_accepted_document');
      const current = existsSync(destination) ? read(destination,job.draftRoot) : null;
      // Only an explicitly created revision seed can be replaced. Ordinary init is a lookup.
      if (current !== null && (!job.proposalRevisionPending || job[kind]?.path !== destination || hash(current) !== job[kind]?.hash)) fail('creation_preparation_draft_changed');
      const text = render();
      receipt = {schema:'pritha-creation-host-operation-v1',jobId:job.jobId,instanceId:job.instanceId,generation:creationGeneration(job),
        kind,inputHash,releaseSha:job.releaseSha,destination,previousHash:current===null?null:hash(current),
        text,outputHash:hash(text),status:'prepared',createdAt:new Date().toISOString()};
      atomicWriteFile(file,JSON.stringify(receipt));
    }
    const current = existsSync(destination) ? read(destination,job.draftRoot) : null;
    const currentHash = current===null?null:hash(current);
    if (currentHash !== receipt.outputHash) {
      if (receipt.status==='completed' || currentHash !== receipt.previousHash) fail('creation_preparation_draft_changed','Черновик изменён после подготовки. Автоматическая перезапись остановлена.');
      atomicCompareAndSwapFile(destination,current,receipt.text);
    }
    options.afterPublish?.(receipt);
    if (receipt.status !== 'completed') atomicWriteFile(file,JSON.stringify({...receipt,status:'completed',completedAt:new Date().toISOString()}));
    return {path:destination,hash:receipt.outputHash,text:receipt.text,operation:file};
  });
}

export function prepareCreationContract(job, brief, options) {
  const normalized = readCreationBrief('```pritha-brief-json\n'+JSON.stringify(brief)+'\n```',job);
  if (normalized.issues.length) fail('creation_brief_invalid',normalized.issues.join('\n'));
  const result = publish(job,'contract',normalized.hash,() => {
    const {data,cliOptions} = parseInterviewBriefDecisions(JSON.stringify(normalized.brief));
    // Host research v2 checks primary sources and has no repository discovery: a
    // brief that leaves the policy to "auto" would wait for discovery forever.
    const repository = job.researchProtocolVersion === 2 && [undefined,'auto'].includes(cliOptions['repository-policy'])
      ? {'repository-policy':'not-applicable','repository-topics':'none','repository-waiver':'Pritha host research checks the primary API, runtime and security sources of this contract; the approved brief names no repository to reuse, so repository discovery cannot change it.'}
      : {};
    // The contract states the job's real build budget; delivery enforces the same numbers.
    applyInterviewTechnicalProposal(data,{...cliOptions,...repository,'build-token-budget':String(job.budget.maxTokens),'build-iterations':String(job.budget.maxIterations),
      'build-elapsed-ms':String(job.budget.maxActiveMs),'repeated-failure-threshold':String(job.budget.repeatedFailureThreshold),'target-folder':job.target});
    const generation = creationGeneration(job);
    // Model-authored Outcomes declare their product API; the generic verifier checks it.
    if (job.outcomeProtocolVersion === 1 && data.interviewPreset === 'llm-app') data.outcomeTrialPreset = 'llm-operation-v1';
    return contractMarkdown({...data,date:job.createdAt.slice(0,10),artifactId:path.basename(job.documentIdentity.contract,'.md'),
      // An explicit revision seed retains its authored agent identity. Only the
      // document identity changes; old accepted documents stay attributable.
      ...(job.proposalRevisionPending && job.contract ? {agentId:contractData(job.contract.path,{root:options.root}).agentId} : {}),
      initRequestFingerprint:`sha256:${normalized.hash}`}).replace(/^---\n/,`---\ncreation_generation: ${generation}\n${job.researchProtocolVersion===2?`research_topic_policy: ${job.researchTopicPolicyVersion || 2}\n`:''}`);
  },options);
  const issues = validateContract(result.path,{root:options.root,print:false});
  if (issues.length) fail('creation_host_contract_invalid',issues.join('\n'));
  return {contract:{...result,issues:[]},brief:normalized.brief,briefHash:normalized.hash};
}

export function prepareCreationOutcome(job, options) {
  if (!job.approvals?.contract || job.approvals.contract.hash !== job.contract?.hash
    || hash(read(job.contract.path,options.stateRoot)) !== job.contract.hash) fail('creation_contract_approval_required');
  const data = contractData(job.contract.path,{root:options.root});
  if (data.fm.status!=='accepted' || data.technicalSlug!==job.agentId) fail('creation_contract_approval_required');
  const inputHash = options.authoredHash ? hash(`${job.contract.hash}:${options.authoredHash}`) : job.contract.hash;
  const render = () => renderOutcomeSpecFromContract(data,{
    root:options.root,date:job.createdAt.slice(0,10),artifactId:path.basename(job.documentIdentity.outcome,'.md'),
    ...(options.authored ? {authored:options.authored} : {}),
  });
  if (options.authored) {
    // Authored content is validated before any byte is published, so a repair can publish again.
    const candidate = validateOutcomeSpecText(render(), {root:options.root}).issues;
    if (candidate.length) fail('creation_outcome_candidate_invalid', candidate.map(issue=>issue.message||issue.code).join('\n'));
  }
  const result = publish(job,'outcome',inputHash,render,options);
  const issues = outcomeSpecFile(result.path,{root:options.root,stateRoot:options.stateRoot}).issues;
  if (issues.length) fail('creation_host_outcome_invalid',issues.map(issue=>issue.message||issue.code).join('\n'));
  return {outcome:{...result,issues:[]}};
}

/** Contract facts the model needs to author the Outcome; numbering matches core:N and success:N. */
export function creationOutcomeAuthoringContext(job, options) {
  const data = contractData(job.contract.path, {root:options.root});
  const list = value => (Array.isArray(value) ? value : String(value || '').split(/;\s+/)).map(item => String(item).trim()).filter(Boolean);
  return {preset:data.fm.outcome_trial_preset || 'none', primaryInterface:data.primaryInterface, mission:data.primaryMission,
    coreFunctions:list(data.coreFunctions).map((text, index) => ({ref:`core:${index + 1}`, text})),
    successCriteria:list(data.successCriteria).map((text, index) => ({ref:`success:${index + 1}`, text})),
    workflows:list(data.criticalWorkflows), constraints:list(data.productConstraints), nonGoals:list(data.outOfScope)};
}

const outcomeText = (value, max = 2000) => typeof value === 'string' && value.trim() && value.length <= max;
/** Product-specific Outcome content authored by the model; the host owns format, locks and verifiers. */
export function readCreationOutcome(answer, preset) {
  const blocks = fencedJsonBlocks(answer, 'pritha-outcome-json');
  if (blocks.length !== 1) return {issues:['Return exactly one pritha-outcome-json fenced block.']};
  try {
    const value = JSON.parse(blocks[0]), issues = [];
    if (value?.schemaVersion !== 1) issues.push('schemaVersion must be 1.');
    if (!outcomeText(value?.oneLiner, 600)) issues.push('oneLiner must describe the visible result.');
    if (!Array.isArray(value?.doneWhen) || !value.doneWhen.length || value.doneWhen.some(item => !outcomeText(item, 600))) issues.push('doneWhen must list observable conditions.');
    for (const key of ['progress', 'completion', 'recovery']) if (!outcomeText(value?.journey?.[key])) issues.push(`journey.${key} must be text.`);
    const sessions = Array.isArray(value?.exampleSessions) ? value.exampleSessions : [];
    if (!sessions.length || sessions.length > 4) issues.push('exampleSessions must contain 1-4 concrete sessions.');
    sessions.forEach((session, index) => {
      if (!outcomeText(session?.name, 80)) issues.push(`exampleSessions[${index}].name must be text.`);
      const turns = Array.isArray(session?.transcript) ? session.transcript : [];
      if (turns.length < 2 || turns.length > 16 || turns.some(turn => !['user', 'agent'].includes(turn?.role) || !outcomeText(turn?.text, 1500)))
        issues.push(`exampleSessions[${index}].transcript needs 2-16 {role:user|agent,text} turns with concrete data.`);
    });
    const acceptance = Array.isArray(value?.acceptance) ? value.acceptance : [];
    if (!acceptance.length || acceptance.length > 24) issues.push('acceptance must contain 1-24 checks.');
    acceptance.forEach((item, index) => {
      if (!outcomeText(item?.statement, 400) || !outcomeText(item?.passCriteria, 1500)) issues.push(`acceptance[${index}] needs statement and concrete passCriteria.`);
      if (!Array.isArray(item?.covers) || !item.covers.length || item.covers.some(ref => !/^(core|success):\d{1,2}$/.test(ref))) issues.push(`acceptance[${index}].covers must list core:N or success:N references.`);
    });
    if (value?.surfaces !== undefined && (!Array.isArray(value.surfaces) || value.surfaces.some(item => !outcomeText(item?.purpose, 400) || !outcomeText(item?.primaryAction, 400))))
      issues.push('surfaces must be [{surface,purpose,primaryAction}].');
    if (API_DECLARED_PRESETS.has(preset)) issues.push(...productApiIssues(value?.productApi));
    return issues.length ? {issues} : {authored:value, hash:hash(JSON.stringify(value)), issues:[]};
  } catch (error) { return {issues:[error.message]}; }
}

export function completeCreationOutcome(job, answer, options) {
  if (job.preparation?.outcomeTurnId === options.turnId) return job;
  const next = structuredClone(job), repairs = job.preparation?.outcomeRepairCount || 0;
  next.preparation = {...next.preparation, outcomeTurnId:options.turnId, pendingOutcomeTurnId:null};
  const context = creationOutcomeAuthoringContext(job, options);
  let parsed = readCreationOutcome(answer, context.preset), prepared = null;
  if (!parsed.issues.length) {
    try { prepared = prepareCreationOutcome(job, {...options, authored:parsed.authored, authoredHash:parsed.hash}); }
    catch (error) { parsed = {issues:[error.message]}; }
  }
  if (parsed.issues.length) {
    next.preparation.outcomeErrors = parsed.issues;
    next.preparation.outcomeRepairCount = repairs + 1;
    if (!['paused','cancelled'].includes(next.status)) {
      next.status = repairs < 1 ? 'pending' : 'blocked';
      next.autoContinue = repairs < 1;
      next.blocker = {code:repairs < 1 ? 'creation_outcome_repair' : 'creation_outcome_invalid', message:parsed.issues.join('\n')};
    }
    return next;
  }
  next.outcome = prepared.outcome;
  next.preparation.outcomeErrors = [];
  if (!['paused','cancelled'].includes(next.status)) {next.status = 'pending';next.blocker = null;}
  return next;
}

export function creationOutcomePrompt(job) {
  return [
    'You are Pritha\'s specification author. The operator approved the architecture contract. Write the product-specific Outcome Spec content from packet.outcomeAuthoring (numbered contract functions and success criteria), packet.brief and the dialogue. Do not run tools or author files; the host renders the document, locks it and installs protected verifiers, and the operator approves it separately.',
    'Make it concrete for this product, never generic: realistic example sessions with actual sample data and the exact visible result; acceptance checks an operator can perform in the product with a precise expected outcome (what to enter or click and what must appear, persist, download or fail clearly). Cover every core:N at least once and every success:N. Respect constraints and non-goals; add nothing the contract excludes.',
    'Return a short summary for the operator, then exactly one fenced block: a line ```pritha-outcome-json, then the JSON on the following lines, then a closing line ```. JSON shape: {"schemaVersion":1,"oneLiner":"...","doneWhen":["..."],"journey":{"entryPoint":"web","goal":"...","start":"...","progress":"...","approval":"...","completion":"...","recovery":"..."},"surfaces":[{"surface":"web","purpose":"...","primaryAction":"..."}],"exampleSessions":[{"name":"...","transcript":[{"role":"user","text":"..."},{"role":"agent","text":"..."}]}],"acceptance":[{"statement":"...","covers":["core:1","success:2"],"passCriteria":"..."}]' +
      ',"productApi":{...only for llm-operation-v1}}.',
    'When packet.outcomeAuthoring.preset is llm-operation-v1, also declare productApi — the HTTP API the protected verifier will call on scripts/server.mjs: {"operation":{"method":"POST","path":"/api/<resource>","inputField":"<field holding the user text>","extraBody":{optional constant fields}},"list":{"path":"/api/<resource>","itemsField":"<array field>"},"item":{"path":"/api/<resource>/:id"} (optional),"export":{"path":"/api/<resource>/:id/export"} (optional, required when the product exports),"sampleInput":"<realistic user input>","providerResponse":"<the exact model reply your product prompt expects, e.g. the JSON it parses, containing {{nonce}} inside a value that is saved and returned>"}. Use {{nonce}} only inside providerResponse; example sessions and acceptance checks use real sample data. The operation makes one model call through the Pritha binding, returns {id,...result} and saves it; the list returns saved results. Use the same API in the UI.',
    'Model access (llm-app): the product never holds, asks for or reads a NeuralDeep key and never calls NeuralDeep directly. When the agent\'s NeuralDeep binding is enabled in Pritha, the host injects PRITHA_LLM_BASE_URL, PRITHA_LLM_MODEL and PRITHA_LLM_TOKEN at service start. A missing key or provider is checked by disabling the agent\'s binding in Pritha (Agents → «NeuralDeep для агента» → «Отключено»); never tell the operator to set environment variables, .env files or keys.',
    ...(job.preparation?.outcomeErrors?.length ? [`Correct only these errors: ${JSON.stringify(job.preparation.outcomeErrors)}`] : []),
  ].join('\n');
}

export function completeCreationBrief(job, answer, options) {
  if(job.preparation?.proposalTurnId===options.turnId)return job;
  const parsed=readCreationBrief(answer,job),next=structuredClone(job);
  const previous=job.preparation?.generation===creationGeneration(job)?job.preparation:{};
  next.preparation={...previous,generation:creationGeneration(job),proposalTurnId:options.turnId,pendingProposalTurnId:null};
  const interview=/```pritha-brief-json/.test(String(answer)) ? null : readCreationInterview(answer);
  const rounds=previous.interview?.rounds || 0;
  if(interview && !interview.issues.length && rounds<CREATION_INTERVIEW_ROUNDS) {
    // The operator answers in this chat; the next brief turn receives the whole dialogue.
    next.preparation.interview={rounds:rounds+1,turnId:options.turnId,...interview.interview,
      history:[...(previous.interview?.history || []),{turnId:options.turnId,questions:interview.interview.questions.map(({id,question})=>({id,question}))}]};
    next.preparation.briefErrors=[];
    if(!['paused','cancelled'].includes(next.status)) {next.status='waiting_input';next.autoContinue=false;next.blocker=null;}
    return next;
  }
  if(interview) parsed.issues=[...(interview.issues.length?interview.issues:[`Interview rounds are exhausted (${CREATION_INTERVIEW_ROUNDS}). Return the final pritha-brief-json using the operator answers and your stated defaults.`])];
  if(parsed.issues.length) {
    const question=isCreationClarification(answer);
    const repairs=previous.briefRepairCount || 0;
    next.preparation.briefErrors=parsed.issues;
    next.preparation.briefRepairCount=question?repairs:repairs+1;
    if(!['paused','cancelled'].includes(next.status)) {
      next.status=question?'waiting_input':repairs<1?'pending':'blocked';
      next.autoContinue=!question && repairs<1;
      next.blocker=question?null:{code:repairs<1?'creation_brief_repair':'creation_brief_invalid',message:parsed.issues.join('\n')};
    }
    return next;
  }
  const prepared=prepareCreationContract(job,parsed.brief,options);
  next.contract=prepared.contract;
  next.proposalRevisionPending=false;
  next.preparation={...next.preparation,brief:prepared.brief,briefHash:prepared.briefHash,briefErrors:[]};
  // An interview round stopped automatic work while the operator answered; the
  // final brief resumes it, so the approved contract proceeds like a direct brief.
  if(!['paused','cancelled'].includes(next.status)) {next.status='pending';next.blocker=null;next.autoContinue=true;}
  return next;
}

export function creationBriefPrompt(job) {
  return [
    'You are Pritha\'s product interviewer and specification author for a new child agent. Work proposal-first: study the request and the whole dialogue, synthesize a concrete candidate product, then decide whether material product decisions are still open. Do not run tools or author files. Documents are approved separately through the UI.',
    'Material decisions (ask only about these): the final user-visible result and primary user; observable done conditions; the main interface and the first end-to-end journey; what v1 includes and deliberately excludes; sensitive data, consequential actions and approval boundaries; choices that change material cost, privacy/security, an irreversible action or an external dependency. Routine technical choices (runtime, storage engine, libraries, tests, operations) are yours to propose from Pritha standards; never ask about them.',
    `Interview rounds used: ${job.preparation?.interview?.rounds || 0} of ${CREATION_INTERVIEW_ROUNDS}. ${(job.preparation?.interview?.rounds || 0)>=CREATION_INTERVIEW_ROUNDS?'No rounds remain: return the final brief.':'If a material decision is open and a round remains, answer in the operator\'s language with a short preliminary specification (what you understood and propose), then numbered questions, each with why it matters and your proposed default, and finish with exactly one fenced block: a line ```pritha-interview-json, then the JSON on the following lines, then a closing line ```. JSON shape: {"schemaVersion":1,"questions":[{"id":"q1","question":"...","why":"...","options":["..."],"default":"..."}],"assumptions":["..."],"draft":"preliminary specification in 3-8 sentences"}. At most 5 questions; do not include a pritha-brief-json block in that answer.'}`,
    'Return the final brief when nothing material is open, when the operator accepted your defaults, or when no rounds remain: exactly one pritha-brief-json fenced JSON block that applies every operator answer and your stated defaults. Record remaining assumptions in constraints or design.riskNotes.',
    'Use a Markdown fence starting with ```pritha-brief-json and ending with ```. Do not use XML or previous_brief tags. All design fields, including riskNotes, are strings, not arrays. Do not promise to check sources during this tool-free proposal step; the research stage checks them after document approval.',
    'Preserve every stated requirement, source URL, constraint and permission. Never ask about something the request or dialogue already answers.',
    'When the packet contains proposalRevision, apply its exact operator instruction to the previous brief while preserving all other requirements. The previous brief is a revision seed, not a requirement to repeat an unchanged proposal. Revision is not approval.',
    `Reserved identity.slug=${job.agentId}; technical.targetFolder=${job.target}. Display identity.name is independent. No dates, statuses, locks, approval claims, filenames, Trial ids or verifier commands.`,
    'Schema: {schemaVersion:1,identity:{name,slug},goal,user,successCriteria:[text],coreFunctions:[text],workflows:[text],sources:[text],constraints:[text],nonGoals:[text],permissions:{network:[text],filesystem:[text],authorization:text},technical:{preset:"generic|local-feed|llm-app",sourceFormat:"json|rss|atom|mixed",repositoryResearchPolicy:"auto|required|registry-only|not-applicable",repositoryResearchWaiverReason:text},design:{memoryModel,storedData,inputDataTypes,sensitiveData,riskNotes}}. Omit inapplicable technical fields. Choose llm-app whenever the product requires model-generated content: it uses a Pritha-managed NeuralDeep binding, and the Outcome later declares the product API that a protected verifier checks. Choose local-feed only for a deterministic feed app without LLM features. Waiving repository discovery does not waive API/runtime/source checks.',
    ...(job.preparation?.briefErrors?.length?[`Correct only these structural errors: ${JSON.stringify(job.preparation.briefErrors)}`]:[]),
  ].join('\n');
}
