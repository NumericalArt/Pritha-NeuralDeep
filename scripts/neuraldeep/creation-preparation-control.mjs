import {readCreationResearch} from './creation-research-context.mjs';
import {creationSemanticProgress} from './creation-context-packet.mjs';
import {creationPreparationUsage,preparationPhase} from './creation-preparation-policy.mjs';
import {dispatchBlockerMessage} from './dispatch-blocker-message.mjs';

/** Rotation is a host decision after exit, final usage and semantic progress, never a model request. */
export function settleCreationPreparation(job,receipt,options) {
  if(job.preparationPolicyVersion!==2)return job;
  const next=structuredClone(job),phase=preparationPhase(options.phase || job.phase);
  let research=null;
  if(phase==='research') {
    try {research=readCreationResearch(job,options);}
    catch(error) {
      if(!receipt.blocker)receipt={...receipt,blocker:{code:'provider_budget_research_changed',message:error.message}};
    }
  }
  const progressHash=creationSemanticProgress(job,research);
  if(research)next.researchProgress={checked:research.checked,remaining:research.remaining};
  const progress=progressHash!==job.contextPacket?.progressHash;
  if(!receipt.blocker && phase==='research' && receipt.processExited && receipt.tokens!==null) {
    next.researchAttemptCompleted=research?.gate.ok===true;
    if(!next.researchAttemptCompleted && !progress)receipt={...receipt,blocker:{code:'provider_budget_no_progress'}};
  }
  if(!receipt.blocker || !/^provider_budget_/.test(receipt.blocker.code))return next;
  const code=receipt.blocker.code,rotations=job.preparationRotations?.[phase] || 0;
  const allowed=code==='provider_budget_context_boundary' && progress && receipt.processExited && receipt.tokens!==null
    && !job.budget.unknownAttempts.length && rotations<job.preparationPolicy.maxRotationsPerPhase;
  if(allowed) {
    next.preparationRotations={...job.preparationRotations,[phase]:rotations+1};
    next.preparationStop=null;
    next.checkpoint={...next.checkpoint,progressHash,contextRotation:{phase,from:job.contextPacket.hash}};
    if(!['paused','cancelled'].includes(next.status)){next.status='pending';next.autoContinue=true;next.blocker=null;}
    if(research)next.researchAttemptCompleted=research.gate.ok;
  } else {
    const message=dispatchBlockerMessage(code);
    next.preparationStop={code,message,progressHash,generation:job.generation};
    if(!['paused','cancelled'].includes(next.status)){next.status='blocked';next.blocker={code,message};}
    next.autoContinue=false;
  }
  return next;
}

export function creationPreparationView(store,job) {
  if(job.preparationPolicyVersion!==2)return {};
  const preparation=creationPreparationUsage(store,job);
  const turnId=job.activeTurnId || job.contextPacket?.workUnitId;
  const row=turnId?store.db.prepare("SELECT receipt FROM runtime_receipts WHERE json_extract(receipt,'$.workload_id')=? ORDER BY rowid DESC LIMIT 1").get(turnId):null;
  const receipt=row?JSON.parse(row.receipt):null,prepared=receipt?.preparation;
  const blocker=job.preparationStop || job.blocker;
  return {preparation:{...preparation,limits:job.preparationPolicy,research:job.researchProgress || null},
    context:{bytes:prepared?.bytes ?? null,packetBytes:job.contextPacket?.bytes ?? null,reservation:prepared?.reservation ?? null,
      requestMode:prepared?.requestMode,sourceBytes:prepared?.sourceBytes,
      outputLimit:prepared?.outputLimit ?? null,freshLimit:job.preparationPolicy.freshBytes,rotationLimit:job.preparationPolicy.rotationBytes,hardLimit:job.preparationPolicy.hardBytes},
    nextDispatch:{status:blocker || preparation.pendingRequests || preparation.unknownRequests?'blocked':prepared?'checked':'unprepared',
      reason:blocker?.message || (preparation.pendingRequests?'Ожидается ответ текущего запроса.':preparation.unknownRequests?'Расход запроса неизвестен.':!prepared?'Полный запрос ещё не подготовлен.':'Следующий запрос будет проверен повторно перед отправкой.')}};
}
