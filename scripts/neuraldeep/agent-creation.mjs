import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile, withFileLock } from '../lib/atomic-file.mjs';
import { readBoundedRegularFile } from '../lib/safe-file-read.mjs';
import { readBuildIdentity } from '../lib/release-artifact.mjs';
import { parseFrontmatterData } from '../lib/frontmatter.mjs';
import { contractData, validateContract } from '../agents-mother/contract.mjs';
import { normalizeInterviewBrief } from '../agents-mother/interview-brief.mjs';
import { outcomeSpecFile, approveOutcomeSpec, verifyOutcomeApproval, outcomeDocumentLock } from '../agents-mother/outcome-spec.mjs';
import { prepareOutcomeVerifierPreset } from '../agents-mother/outcome-verifier-presets.mjs';
import { readAgentCatalog } from '../agents-mother/identity.mjs';
import { creationGeneration, creationCanonicalFilename } from './creation-generation.mjs';
import { creationRevisionPending } from './creation-revision.mjs';
import { AgentCreationError, creationBudgetBlocker, creationPhase } from './agent-creation-store.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
function git(root,args) {
  return execFileSync('git',['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false',...args],{cwd:root,encoding:'utf8',timeout:15000,stdio:['ignore','pipe','ignore']}).trim();
}
export function creationReleaseIdentity(root) {
  let source=null, runtime=null, sourceDirty=true;
  try { source=git(root,['rev-parse','HEAD']); sourceDirty=Boolean(git(root,['status','--porcelain=v1','--untracked-files=normal'])); } catch {}
  try {
    const identity=readBuildIdentity(path.join(root,'interfaces/control-center/.next'));
    const processCommit=process.env.PRITHA_CONTROL_CENTER_RELEASE_COMMIT;
    const processBuildId=process.env.PRITHA_CONTROL_CENTER_BUILD_ID;
    const processPinned=processCommit!==undefined || processBuildId!==undefined;
    if(identity && (!processPinned || (processCommit===identity.commit && processBuildId===identity.buildId)))runtime=identity.commit;
  } catch {}
  return {source,runtime,execution:null,sourceDirty};
}
export function creationDraftRoot(stateRoot,instanceId,chatId) {
  const jobId=`creation_${digest(JSON.stringify([instanceId,chatId])).slice(0,24)}`;
  return path.join(stateRoot,'creation-drafts',jobId);
}
function filesIn(directory,extension='.md') {
  if (!existsSync(directory)) return [];
  const stat=lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new AgentCreationError('creation_document_boundary');
  const entries=readdirSync(directory,{withFileTypes:true});
  if(entries.length>150) throw new AgentCreationError('creation_documents_limit');
  return entries.filter(entry=>entry.isFile() && entry.name.endsWith(extension)).map(entry=>path.join(directory,entry.name));
}
function text(file,boundary) {return readBoundedRegularFile(file,{allowedRoots:[boundary],maxBytes:512*1024}).text;}
function document(file,boundary,kind,options) {
  const content=text(file,boundary);
  let issues=[];
  try {
    issues=kind==='contract' ? validateContract(file,{root:options.root,print:false})
      : outcomeSpecFile(file,options).issues.map(issue=>typeof issue==='string'?issue:issue.message || issue.code || 'invalid outcome');
  } catch {issues=['Документ пока не проходит проверку.'];}
  return {path:file,hash:digest(content),text:content,issues};
}
const APPROVAL_SCHEMA = 'pritha-creation-document-approval-v1';
const approvedContractText = content => content.replace(/^(status:\s*).*$/m,'$1accepted').replace(/^- Build token budget confirmation: pending$/m,'- Build token budget confirmation: user');
const requestHash = request => digest(JSON.stringify({requestId:request.requestId,expectedRevision:request.expectedRevision,action:request.action,actor:request.actor || 'user',authorizationBasis:request.authorizationBasis || ''}));
function approvalPaths(job,kind,options,create=false) {
  if(!['contract','outcome'].includes(kind) || !/^creation_[a-f0-9]{24}$/.test(job.jobId)
    || path.resolve(job.draftRoot)!==path.resolve(creationDraftRoot(options.stateRoot,job.instanceId,job.chatId))) throw new AgentCreationError('creation_approval_scope_invalid');
  const relative=['audit','creation-approvals',job.jobId,...(creationGeneration(job)>1?[`revision-${creationGeneration(job)}`]:[])];
  let directory=path.resolve(options.stateRoot);
  if(!existsSync(directory) || !lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink())throw new AgentCreationError('creation_document_boundary');
  for(const part of relative) {
    directory=path.join(directory,part);
    if(!existsSync(directory)) {if(!create)return {file:path.join(directory,...relative.slice(relative.indexOf(part)+1),`${kind}.json`)};mkdirSync(directory,{mode:0o700});}
    const stat=lstatSync(directory);if(!stat.isDirectory() || stat.isSymbolicLink())throw new AgentCreationError('creation_document_boundary');
  }
  return {file:path.join(directory,`${kind}.json`)};
}
function readCreationApproval(job,kind,options) {
  const file=approvalPaths(job,kind,options).file;
  if(!existsSync(file))return null;
  let receipt;
  try {receipt=JSON.parse(readBoundedRegularFile(file,{allowedRoots:[options.stateRoot],maxBytes:2*1024*1024}).text);}catch{throw new AgentCreationError('creation_approval_receipt_invalid');}
  if(receipt.schema!==APPROVAL_SCHEMA || !['prepared','completed'].includes(receipt.status)
    || receipt.jobId!==job.jobId || receipt.chatId!==job.chatId || receipt.instanceId!==job.instanceId || receipt.agentId!==job.agentId || receipt.kind!==kind
    || (receipt.generation ?? 1)!==creationGeneration(job) || receipt.target!==path.resolve(job.target) || receipt.releaseSha!==job.releaseSha
    || receipt.destination!==path.join(options.stateRoot,'agents','contracts',creationCanonicalFilename(job,receipt.source?.path || ''))
    || path.dirname(receipt.source?.path || '')!==path.join(job.draftRoot,'contracts')
    || typeof receipt.source?.text!=='string' || digest(receipt.source.text)!==receipt.source.hash
    || !receipt.request || typeof receipt.request!=='object' || typeof receipt.approvedAt!=='string'
    || receipt.requestHash!==requestHash(receipt.request)
    || receipt.request.action!==`approve_${kind}` || !['user','codex-operator'].includes(receipt.request.actor)
    || (receipt.request.actor==='codex-operator' && !String(receipt.request.authorizationBasis || '').trim()))throw new AgentCreationError('creation_approval_receipt_invalid');
  return receipt;
}
function approveBlock(next,code,message='Согласованный документ или подтверждение хоста изменились. Требуется проверка перед продолжением.') {
  if(!['paused','cancelled'].includes(next.status))next.status='blocked';next.blocker={code,message};return next;
}
function assertCanonicalReceipt(job,kind,receipt,options) {
  if(receipt.status!=='completed' || !receipt.approved?.hash || receipt.approved.path!==receipt.destination)throw new AgentCreationError('creation_approval_incomplete');
  const approved=document(receipt.destination,options.stateRoot,kind,options);
  if(approved.hash!==receipt.approved.hash || approved.issues.length || (kind==='contract' ? approved.text!==approvedContractText(receipt.source.text) : outcomeDocumentLock(approved.text)!==outcomeDocumentLock(receipt.source.text)))throw new AgentCreationError('creation_approved_document_changed');
  if(kind==='contract') {
    const contract=contractData(receipt.destination,{root:options.root});
    if(contract.fm.status!=='accepted' || (contract.technicalSlug || contract.agentId)!==job.agentId || path.resolve(options.root,contract.targetFolder)!==path.resolve(job.target))throw new AgentCreationError('creation_approval_scope_invalid');
  } else {
    const contractReceipt=readCreationApproval(job,'contract',options);
    if(!contractReceipt || receipt.contract?.hash!==contractReceipt.approved?.hash || receipt.contract?.path!==contractReceipt.destination)throw new AgentCreationError('creation_contract_approval_required');
    assertCanonicalReceipt(job,'contract',contractReceipt,options);
    const validation=outcomeSpecFile(receipt.destination,options);
    if(path.resolve(options.root,validation.parsed.frontmatter.contract_path || '')!==receipt.contract.path)throw new AgentCreationError('creation_contract_approval_required');
    const approval=verifyOutcomeApproval(receipt.destination,options);
    if(!approval.ok || approval.event?.creation_job_id!==job.jobId || approval.event?.request_id!==receipt.request.requestId || approval.event?.actor!==receipt.request.actor || approval.event?.approval_id!==receipt.outcomeApprovalId)throw new AgentCreationError('creation_outcome_host_receipt_missing');
  }
  return approved;
}
function receiptApproval(receipt) {
  return {hash:receipt.approved.hash,actor:receipt.request.actor,approvedAt:receipt.approvedAt,requestId:receipt.request.requestId,authorizationBasis:receipt.request.authorizationBasis || 'explicit-ui-approval'};
}
/** Discover only this job's drafts. Completed host receipts are the approval authority. */
export function reconcileCreationArtifacts(job,options) {
  const next=structuredClone(job);next.approvals ||= {};let restoredApproval=false;
  try { if(creationRevisionPending(job,options)) return approveBlock(next,'creation_revision_incomplete','Пересмотр прерван. Повторите прежнее действие для восстановления той же версии предложения.'); }
  catch(error) { return approveBlock(next,error.code || 'creation_revision_receipt_invalid'); }
  for (const kind of ['contract','outcome']) {
    let receipt;
    try {receipt=readCreationApproval(job,kind,options);}catch(error){return approveBlock(next,error.code || 'creation_approval_receipt_invalid');}
    if(receipt?.status==='prepared')return approveBlock(next,'creation_approval_incomplete','Подтверждение сохранено, но операция не завершена. Повторите сохранённое действие для восстановления.');
    if(receipt?.status==='completed') {
      try {
        const approved=assertCanonicalReceipt(job,kind,receipt,options);
        if(next.approvals[kind] && (next.approvals[kind].hash!==approved.hash || next.approvals[kind].requestId!==receipt.request.requestId || next.approvals[kind].actor!==receipt.request.actor || next[kind]?.path!==receipt.destination))throw new AgentCreationError('creation_approval_receipt_mismatch');
        if(!next.approvals[kind])restoredApproval=true;
        next[kind]=approved;next.approvals[kind]=receiptApproval(receipt);
      }catch(error){return approveBlock(next,error.code || 'creation_approval_receipt_invalid');}
      continue;
    }
    if(next.approvals[kind])return approveBlock(next,'creation_approval_receipt_missing');
    const expected=kind==='contract'?'agent-contract':'agent-outcome-spec';
    const candidates=filesIn(path.join(job.draftRoot,'contracts')).filter(file=>{
      const content=text(file,job.draftRoot),fm=parseFrontmatterData(content);
      if(fm?.type!==expected || fm.status==='superseded')return false;
      if(kind==='contract') {
        const data=contractData(file,{root:options.root});
        return (data.technicalSlug || data.agentId)===job.agentId && path.resolve(options.root,data.targetFolder)===path.resolve(job.target);
      }
      return next.contract && path.resolve(options.root,String(fm.contract_path || ''))===path.resolve(next.contract.path);
    });
    if(candidates.length>1)return approveBlock(next,'creation_document_ambiguous','Найдено несколько действующих документов. Pritha должна устранить неоднозначность.');
    next[kind]=candidates.length===1 ? document(candidates[0],job.draftRoot,kind,options) : null;
    if(next[kind] && creationGeneration(job)>1) {
      const fm=parseFrontmatterData(next[kind].text);
      if(Number(fm.creation_generation)!==creationGeneration(job) || !String(fm.id || '').endsWith(`-revision-${creationGeneration(job)}`)) next[kind].issues.push('Документ должен иметь creation_generation и новый id текущей версии предложения.');
    }
    if(next[kind] && parseFrontmatterData(next[kind].text)?.status!=='draft') next[kind].issues.push('Согласование создаётся только действием хоста; авторский документ должен иметь статус draft.');
  }
  if(restoredApproval || next.blocker?.code==='creation_approval_incomplete') {
    if(next.blocker?.code==='creation_approval_incomplete')next.blocker=null;
    if(!['running','paused','cancelled','ready'].includes(next.status))next.status='pending';
  }
  next.phase=creationPhase(next);
  if(next.status==='pending' && !next.proposalRevisionPending && next.contract && !next.contract.issues.length && !next.approvals.contract)next.status='awaiting_contract_approval';
  else if(next.status==='pending' && next.approvals.contract && next.outcome && !next.outcome.issues.length && !next.approvals.outcome)next.status='awaiting_outcome_approval';
  return next;
}
export function creationJobView(job,options) {
  const versions=creationReleaseIdentity(options.root);versions.execution=options.executionSha || job.releaseSha;
  const budgetBlocker=creationBudgetBlocker(job);
  const inactive=!['running','cancelled','ready'].includes(job.status);
  const approvalBlocked=/^creation_(?:revision_incomplete|revision_receipt|revision_boundary|approved_document|approval_|canonical_|contract_approval_|outcome_host_receipt)/.test(job.blocker?.code || '');
  let agentCardUrl=null;
  if(job.status==='ready' && job.delivery?.adopted) {
    try {
      const authoredId=contractData(job.contract.path,{root:options.root}).agentId;
      const matches=readAgentCatalog({...options,agentParent:path.dirname(job.target)}).agents.filter(agent=>agent.identityStatus!=='conflict'
        && agent.agentId===authoredId && agent.projectPath===path.resolve(job.target) && agent.contractSource===job.contract?.path);
      if(matches.length===1)agentCardUrl=`/agents/${encodeURIComponent(matches[0].id)}`;
    } catch { /* A missing catalog card cannot weaken verification or create an invented URL. */ }
  }
  return {...job,versions,agentCardUrl,blocker:job.blocker || budgetBlocker,
    actions:{approve_contract:inactive && !job.proposalRevisionPending && job.status==='awaiting_contract_approval' && !job.contract?.issues.length,
      approve_outcome:inactive && job.status==='awaiting_outcome_approval' && !job.outcome?.issues.length,
      revise_proposal:inactive && !job.activeTurnId && !job.scaffoldReady && !job.scaffoldReceipt && !job.deliveryRunId && !job.delivery && !job.budget.unknownAttempts.length && Boolean(job.contract),
      continue:inactive && !job.activeTurnId && !budgetBlocker && !approvalBlocked && !job.status.startsWith('awaiting_'),pause:job.status==='running',cancel:!['cancelled','ready'].includes(job.status)}};
}
export function approveCreationDocument(job,kind,request,options) {
  if(process.env.PRITHA_AGENT_AUTHORING_ROOT)throw new AgentCreationError('creation_approval_requires_host');
  const actor=request.actor || 'user';
  if(!['contract','outcome'].includes(kind) || request.action!==`approve_${kind}` || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(request.requestId || '') || !Number.isSafeInteger(request.expectedRevision))throw new AgentCreationError('creation_approval_request_invalid');
  if(!['user','codex-operator'].includes(actor) || (actor==='codex-operator' && !String(request.authorizationBasis || '').trim()))throw new AgentCreationError('creation_authorization_required');
  const approvedRequest={...request,actor};
  const receiptPath=approvalPaths(job,kind,options,true).file;
  return withFileLock(receiptPath,()=>{
    let receipt=readCreationApproval(job,kind,options);
    if(receipt && receipt.requestHash!==requestHash(approvedRequest))throw new AgentCreationError('creation_approval_request_conflict','Повтор должен использовать прежний запрос подтверждения.');
    if(!receipt) {
      if(request.expectedRevision!==job.revision || job.proposalRevisionPending || ['cancelled','ready','running'].includes(job.status))throw new AgentCreationError('creation_approval_request_stale');
      const next=reconcileCreationArtifacts(job,options),doc=next[kind];
      if(next.blocker || !doc || doc.hash!==job[kind]?.hash || doc.path!==job[kind]?.path || doc.issues.length)throw new AgentCreationError('creation_document_changed','Обновите и проверьте текущий документ.');
      if(kind==='outcome' && !next.approvals.contract)throw new AgentCreationError('creation_contract_approval_required');
      const destination=path.join(options.stateRoot,'agents','contracts',creationCanonicalFilename(job,doc.path));
      if(existsSync(destination))throw new AgentCreationError('creation_canonical_document_exists','Действующий документ без соответствующего подтверждения хоста уже существует.');
      receipt={schema:APPROVAL_SCHEMA,status:'prepared',generation:creationGeneration(job),jobId:job.jobId,chatId:job.chatId,instanceId:job.instanceId,agentId:job.agentId,
        releaseSha:job.releaseSha,target:path.resolve(job.target),kind,source:{path:doc.path,hash:doc.hash,text:doc.text},destination,
        request:approvedRequest,requestHash:requestHash(approvedRequest),approvedAt:new Date().toISOString(),
        contract:kind==='outcome'?{path:next.contract.path,hash:next.contract.hash}:null};
      atomicWriteFile(receiptPath,JSON.stringify(receipt)+'\n');
      options.onApprovalCheckpoint?.('intent_recorded');
    }
    if(receipt.status==='completed') {
      assertCanonicalReceipt(job,kind,receipt,options);
      const restored=reconcileCreationArtifacts(job,options);
      if(restored.blocker)throw new AgentCreationError(restored.blocker.code,restored.blocker.message);
      if(!['cancelled','ready'].includes(restored.status))restored.status='pending';restored.phase=creationPhase(restored);return restored;
    }
    if(kind==='outcome') {
      const contractReceipt=readCreationApproval(job,'contract',options);
      if(!contractReceipt || receipt.contract?.path!==contractReceipt.destination || receipt.contract?.hash!==contractReceipt.approved?.hash)throw new AgentCreationError('creation_contract_approval_required');
      assertCanonicalReceipt(job,'contract',contractReceipt,options);
      const preset=contractData(receipt.contract.path,{root:options.root}).fm.outcome_trial_preset;
      if(preset && preset!=='none')prepareOutcomeVerifierPreset(job.target,preset,{...options,jobId:job.jobId});
    }
    let directory=path.resolve(options.stateRoot);
    for(const part of ['agents','contracts']) {
      directory=path.join(directory,part);
      if(!existsSync(directory))mkdirSync(directory,{mode:0o700});
      if(lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory())throw new AgentCreationError('creation_document_boundary');
    }
    withFileLock(`${receipt.destination}.creation-approval`,()=>{
      const expected=kind==='contract' ? approvedContractText(receipt.source.text) : receipt.source.text;
      if(existsSync(receipt.destination)) {
        const current=text(receipt.destination,options.stateRoot);
        const matching=kind==='contract' ? current===expected : current===expected || (parseFrontmatterData(current)?.status==='approved' && outcomeDocumentLock(current)===outcomeDocumentLock(expected));
        if(!matching)throw new AgentCreationError('creation_canonical_document_changed');
      } else atomicWriteFile(receipt.destination,expected);
      options.onApprovalCheckpoint?.('canonical_written');
      if(kind==='outcome') {
        const existing=verifyOutcomeApproval(receipt.destination,options);
        if(existing.ok && (existing.event?.creation_job_id!==job.jobId || existing.event?.request_id!==request.requestId || existing.event?.actor!==actor))throw new AgentCreationError('creation_outcome_receipt_conflict');
        const outcome=approveOutcomeSpec(receipt.destination,{...options,approvedBy:'user',actor,authorizationBasis:approvedRequest.authorizationBasis,requestId:request.requestId,jobId:job.jobId,approvedAt:receipt.approvedAt});
        receipt.outcomeApprovalId=outcome.event.approval_id;
        options.onApprovalCheckpoint?.('outcome_receipt_written');
      }
      const approved=document(receipt.destination,options.stateRoot,kind,options);
      if(approved.issues.length)throw new AgentCreationError('creation_approved_document_invalid');
      receipt={...receipt,status:'completed',approved:{path:approved.path,hash:approved.hash},completedAt:new Date().toISOString()};
      atomicWriteFile(receiptPath,JSON.stringify(receipt)+'\n');
      options.onApprovalCheckpoint?.('receipt_completed');
    });
    assertCanonicalReceipt(job,kind,receipt,options);
    const restored=reconcileCreationArtifacts(job,options);
    if(restored.blocker)throw new AgentCreationError(restored.blocker.code,restored.blocker.message);
    if(!['cancelled','ready'].includes(restored.status))restored.status='pending';restored.phase=creationPhase(restored);restored.blocker=null;return restored;
  });
}
export function creationPrompt(job) {
  const phase=creationPhase(job);
  const quote=value=>`'${String(value).replaceAll("'", "'\\''")}'`;
  const cli=job.executionCodeRoot ? `node ${quote(path.join(job.executionCodeRoot,'scripts/pritha.mjs'))}` : 'node scripts/pritha.mjs';
  const details=[`Host creation job ${job.jobId}; proposal generation ${creationGeneration(job)}; phase ${phase}; child slug ${job.agentId}; release ${job.releaseSha}.`,
    `Target: ${job.target}. Authoring root: ${job.draftRoot}. CLI init uses PRITHA_AGENT_AUTHORING_ROOT automatically.`,
    `Your working directory is the authoring root. Pinned Pritha CLI: ${cli}. Use this absolute entrypoint for every Pritha command; do not copy or edit its code.`,
    'Work in this one user task. Do not ask the operator to paste checkpoints, write technical phase markers or open a new chat.',
    'Only host UI actions approve documents. Never use outcome approve, draft-scaffold or research bypass flags. Do not write canonical contracts/audit or run scaffold/deliver/start yourself.',
    'Propose defaults from Pritha standards. Ask a question only for a missing material product decision. Keep authored success criteria, sources, rights and constraints.',
    `Use ${cli} validate for reported issues; ${cli} questions lists supported interview values if a value really needs to change. Do not read CLI implementation. Commands must preserve their true exit status (no failure-masking pipelines).`,
    `Accounted preparation tokens: ${job.budget?.tokensUsed ?? 0}; total creation limit: ${job.budget?.maxTokens ?? 1_000_000}. Read each relevant document once, batch independent reads, and avoid unrelated source discovery. The host can stop before another request when its reservation exceeds the remaining budget.`,
    'Never modify Pritha platform source in the execution workspace. Product implementation is owned by the host delivery loop after approvals.'];
  if(job.proposalRevisionPending) details.push(`The operator requested an explicit proposal revision: ${JSON.stringify(job.revisionInstruction)}. Edit the seeded contract ${job.contract?.path} in place; do not run init or copy the accepted canonical document back. Keep creation_generation=${creationGeneration(job)} and its unique id ending -revision-${creationGeneration(job)}. Preserve target and identity; revise the product/port/adapter as requested. Validate the draft and stop for new contract approval. The new Outcome will be authored only after that approval. Earlier draft history is contextual and cannot supply current approval or research.`);
  else if(phase==='interview' || phase==='contract') {
    const brief=normalizeInterviewBrief({identity:{name:'<product name from the request>',slug:job.agentId},
      goal:'<observable result>',user:'<intended user>',successCriteria:['<each acceptance criterion>'],
      coreFunctions:['<each v1 function>'],workflows:['<each user journey>'],sources:['<each requested source>'],
      constraints:['<each limit and error-handling requirement>'],nonGoals:['<each excluded feature>'],
      permissions:{network:['<required sources and provider only>'],filesystem:['<child project only>'],authorization:'<authorized local operator>'},
      design:{memoryModel:'<requested storage, or a proposed local store>',storedData:'<records and user state to persist>',inputDataTypes:'<actual source format and UI inputs>',sensitiveData:'<private data and secret boundary>',riskNotes:'<material data, provider and recovery risks>'},
      technical:{preset:'generic',sourceFormat:'mixed',repositoryResearchPolicy:'auto',repositoryAdoptionMode:'none',repositoryResearchWaiverReason:'not-applicable',targetFolder:job.target}});
    details.push('Prepare the proposal directly from the product request. The complete supported brief shape is below; replace the angle-bracket values, use empty arrays when a field does not apply, and preserve the exact slug and target. Choose preset llm-app for an LLM application, local-feed for a feed application without an LLM, otherwise generic. Presets supply valid runtime, service, provider and test defaults. Do not invent technical enum values or inspect CLI implementation to discover them.',
      `\`\`\`pritha-brief-json\n${JSON.stringify(brief,null,2)}\n\`\`\``,
      'Set sourceFormat to json, rss, atom or mixed. When the user declines repository discovery, set repositoryResearchPolicy to not-applicable and state the reason in repositoryResearchWaiverReason; provider/API/source verification remains required. Set design.memoryModel to the requested storage (for example SQLite). These structured values are rendered into the contract; do not plan a second manual rewrite of generic defaults.',
      `Save this JSON as brief.json in the authoring root, then run: ${cli} init --no-input --brief brief.json --contract-only --build-token-budget ${job.budget?.maxTokens ?? 1_000_000}`,
      'The brief supplies name and mission; additional --name or --mission flags are unnecessary. Init prints the draft contract path and keeps its status draft. It writes under the authoring root, not the child target. Do not add approval or token-budget-confirmation flags.',
      `Validate the printed contract path with: ${cli} validate <contract-path>`,
      'Read the printed draft once to verify storage, provider/fallback, harness boundaries, permissions and risks against the brief; validation alone does not check meaning. App/feed presets provide a product-only runtime table and complete safe harness defaults. Correct only a material mismatch. Avoid overlapping patch hunks or repeated whole-file reads. Validate the absolute printed path, then stop and present the proposal for host approval. Current API/source research belongs to the separate research phase after both approvals. Do not read unrelated platform source, prepare the Outcome or implement the product in this step.');
  }
  else if(phase==='outcome')details.push(`The host already verified the accepted contract ${job.contract.path} and its exact approval. Read that contract once; do not compare it with archived drafts or repeat host approval checks. Run: ${cli} outcome init ${quote(job.contract.path)}`,
    'Read the printed Outcome path once and compare it with the contract. App/feed proposals already include product workflows and a Trial for every contract success criterion. Correct only a material mismatch; do not rewrite sound sections for style. Preserve the two deliverable labels, Trial ids, Covers fields and verifier commands/hashes. A nested bullet in Deliverables creates a new coverage identity, so keep product details in existing criteria. Use small exact edits in the authoring root, not a temporary patch outside it. Do not create replacement smoke checks or edit verifiers. Older draft-bound specs are not canonical.',
    `For proposal generation ${creationGeneration(job)}, the Outcome must keep creation_generation=${creationGeneration(job)} and a unique id${creationGeneration(job)>1?` ending -revision-${creationGeneration(job)}`:''}. Validate with: ${cli} outcome validate <absolute-printed-outcome-path>`,
    'After validation, stop for the separate Outcome approval. Do not scaffold, research, implement or approve in this turn.');
  else if(phase==='research')details.push(`Accepted contract: ${job.contract.path}. Approved outcome: ${job.outcome.path}. Reuse an existing exact-contract research report from the checkpoint. Otherwise run: ${cli} research ${quote(job.contract.path)}`,
    `Get the required topics and gate reasons with: ${cli} external-research ${quote(job.contract.path)} --backend status`,
    'Read the reported research and pattern-pack artifacts once for the memory comparison. Batch primary-source lookups with the available Pritha Search tools. Cover every required topic, including provider/API/runtime/source checks when repository discovery is waived. Record only sources actually checked, their real version/date context and limitations; never invent verification, source dates or claims. Do not inspect CLI implementation or regenerate sound artifacts to discover commands.',
    'Save research-evidence.json in the authoring root using the following shape. Replace all angle-bracket placeholders. Each item covers one reported topic; multiple items may share a checked source when it supports each claim. Source types include official-docs, specification, changelog and official-repository. Confidence is low, medium or high; temporal_compatibility_status is compatible, incompatible or unknown. Synthesis relationship is confirms, refines, contradicts or makes-outdated. For repository adoption, retain the additional contract-required exact repository/license evidence and explicit recommendation; this basic shape does not waive it.',
    `\`\`\`pritha-research-json\n${JSON.stringify({backend:'manual',items:[{topic_id:'<reported topic id>',source_url:'<checked primary HTTPS URL>',source_title:'<actual source title>',source_type:'official-docs',retrieved_at:'<actual ISO timestamp>',claim:'<supported finding>',evidence_summary:'<observed evidence and limitations>',confidence:'medium',version_context:'<actual version/date context>',temporal_compatibility:'<relationship to the selected runtime/API>',temporal_compatibility_status:'compatible'}],synthesis:{relationship:'refines',memory_comparison:'<compare the local research with checked primary sources>',summary:'<findings relevant to this contract>',architecture_decision:'<concrete implementation decision within the accepted contract>',alternatives:['<considered alternative>'],tradeoffs:['<material tradeoff>']}},null,2)}\n\`\`\``,
    `Import the evidence and synthesis together: ${cli} external-research ${quote(job.contract.path)} --backend manual --input ${quote(path.join(job.draftRoot,'research-evidence.json'))}`,
    'Inspect the printed gate status, not only the command exit code. Correct only reported missing/invalid evidence. Stop when the gate is complete; the host verifies the locks, scaffolds and starts delivery. Never hand-edit gate status or approval fields.');
  if(job.checkpoint)details.push(`Saved checkpoint: ${JSON.stringify(job.checkpoint).slice(0,12000)}`);
  if(job.blocker)details.push(`Previous blocker: ${job.blocker.message}`);
  if(job.preflightWarnings?.length)details.push(`Resolve these proposal checks before requesting approval: ${JSON.stringify(job.preflightWarnings)}`);
  return details.join('\n');
}
function command(root,stateRoot,args,extraEnv={}) {
  return new Promise((resolve,reject)=>{
    const env={...process.env,TECHSCOPE_ROOT:root,PRITHA_STATE_ROOT:stateRoot,...extraEnv};
    delete env.PRITHA_AGENT_AUTHORING_ROOT;
    const child=spawn(process.execPath,[path.join(root,'scripts/agents-mother.mjs'),...args],{cwd:root,env,stdio:['ignore','pipe','pipe']});
    let output='';const collect=data=>{output=(output+data).slice(-32000);};child.stdout.on('data',collect);child.stderr.on('data',collect);
    let timedOut=false,killTimer;
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),5000);killTimer.unref();},120000);timer.unref();
    child.once('error',error=>{clearTimeout(timer);clearTimeout(killTimer);reject(error);});
    child.once('close',code=>{clearTimeout(timer);clearTimeout(killTimer);code===0&&!timedOut?resolve(output):reject(new AgentCreationError(timedOut?'creation_host_step_timeout':'creation_host_step_failed',output.slice(-4000)));});
  });
}
/** Only deterministic preparation here. Paid implementation uses the existing delivery loop. */
export async function creationHostStep(job,options) {
  const {runCreationScaffoldStep}=await import('./creation-scaffold.mjs');
  return runCreationScaffoldStep(job,options,args=>command(options.root,options.stateRoot,args,
    options.agentParent?{PRITHA_AGENT_PARENT:options.agentParent}:{}));
}
