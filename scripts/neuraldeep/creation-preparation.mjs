import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { atomicCompareAndSwapFile, atomicWriteFile, withFileLock } from '../lib/atomic-file.mjs';
import { readBoundedRegularFile } from '../lib/safe-file-read.mjs';
import { normalizeInterviewBrief, validateInterviewBrief } from '../agents-mother/interview-brief.mjs';
import { contractData, validateContract } from '../agents-mother/contract.mjs';
import { renderOutcomeSpecFromContract, outcomeSpecFile } from '../agents-mother/outcome-spec.mjs';
import { applyInterviewTechnicalProposal, contractMarkdown, parseInterviewBriefDecisions } from '../agents-mother/interview-proposal.mjs';
import { creationDocumentIdentity, creationGeneration } from './creation-generation.mjs';
import { creationHostDirectory } from './creation-research.mjs';
import { AgentCreationError } from './agent-creation-store.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const read = (file, root) => readBoundedRegularFile(file, {allowedRoots:[root],maxBytes:512*1024}).text;
const fail = (code, message) => { throw new AgentCreationError(code, message); };

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
    applyInterviewTechnicalProposal(data,{...cliOptions,'build-token-budget':String(job.budget.maxTokens),'target-folder':job.target});
    const generation = creationGeneration(job);
    return contractMarkdown({...data,date:job.createdAt.slice(0,10),artifactId:path.basename(job.documentIdentity.contract,'.md'),
      initRequestFingerprint:`sha256:${normalized.hash}`}).replace(/^---\n/,`---\ncreation_generation: ${generation}\n`);
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
  const result = publish(job,'outcome',job.contract.hash,() => renderOutcomeSpecFromContract(data,{
    root:options.root,date:job.createdAt.slice(0,10),artifactId:path.basename(job.documentIdentity.outcome,'.md'),
  }),options);
  const issues = outcomeSpecFile(result.path,{root:options.root,stateRoot:options.stateRoot}).issues;
  if (issues.length) fail('creation_host_outcome_invalid',issues.map(issue=>issue.message||issue.code).join('\n'));
  return {outcome:{...result,issues:[]}};
}

export function completeCreationBrief(job, answer, options) {
  if(job.preparation?.proposalTurnId===options.turnId)return job;
  const parsed=readCreationBrief(answer,job),next=structuredClone(job);
  const previous=job.preparation?.generation===creationGeneration(job)?job.preparation:{};
  next.preparation={...previous,generation:creationGeneration(job),proposalTurnId:options.turnId,pendingProposalTurnId:null};
  if(parsed.issues.length) {
    const question=!String(answer).includes('pritha-brief-json') && /[?？]/.test(answer);
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
  if(!['paused','cancelled'].includes(next.status)) {next.status='pending';next.blocker=null;}
  return next;
}

export function creationBriefPrompt(job) {
  return [
    'Propose product content only. Return exactly one pritha-brief-json fenced JSON block; do not run tools or author Markdown/files. The host generates and validates the contract and Outcome. Each is approved separately through the UI.',
    'Preserve every stated requirement, source URL, constraint and permission. Ask a concise substantive question only if its answer changes the outcome or authority; otherwise propose the simplest sufficient design.',
    `Reserved identity.slug=${job.agentId}; technical.targetFolder=${job.target}. Display identity.name is independent. No dates, statuses, locks, approval claims, filenames, Trial ids or verifier commands.`,
    'Schema: {schemaVersion:1,identity:{name,slug},goal,user,successCriteria:[text],coreFunctions:[text],workflows:[text],sources:[text],constraints:[text],nonGoals:[text],permissions:{network:[text],filesystem:[text],authorization:text},technical:{preset:"generic|local-feed|llm-app",sourceFormat:"json|rss|atom|mixed",repositoryResearchPolicy:"auto|required|registry-only|not-applicable",repositoryResearchWaiverReason:text},design:{memoryModel,storedData,inputDataTypes,sensitiveData,riskNotes}}. Omit inapplicable technical fields. The llm-app preset uses SQLite and a Pritha-managed NeuralDeep binding; local-feed is deterministic. Waiving repository discovery does not waive API/runtime/source checks.',
    ...(job.preparation?.briefErrors?.length?[`Correct only these structural errors: ${JSON.stringify(job.preparation.briefErrors)}`]:[]),
  ].join('\n');
}
