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
    try {research=(options.readResearch || readCreationResearch)(job,options);}
    catch(error) {
      if(!receipt.blocker)receipt={...receipt,blocker:{code:'provider_budget_research_changed',message:error.message}};
    }
  }
  const progressHash=creationSemanticProgress(job,research);
  if(research)next.researchProgress={checked:research.checked,remaining:research.remaining};
  const progress=progressHash!==job.contextPacket?.progressHash;
  if(receipt.blocker?.code==='neuraldeep_unavailable') {
    const phaseKey=phase || 'brief';
    const used=job.providerOutageContinuations?.[phaseKey] || 0;
    const settled=receipt.processExited && receipt.tokens!==null && !job.budget.unknownAttempts.length;
    if(settled && used<1) {
      next.providerOutageContinuations={...job.providerOutageContinuations,[phaseKey]:used+1};
      next.preparationStop=null;
      next.checkpoint={...next.checkpoint,progressHash,providerOutage:{phase:phaseKey,continued:true}};
      if(!['paused','cancelled'].includes(next.status)){next.status='pending';next.autoContinue=true;next.blocker=null;}
      return next;
    }
    if(!['paused','cancelled'].includes(next.status)) {
      next.status='blocked';
      next.autoContinue=false;
      next.blocker={code:'neuraldeep_unavailable',message:settled
        ? 'Сеть NeuralDeep оборвалась повторно на этом шаге. Хост уже продолжил один раз с checkpoint и не повторял команды. Можно продолжить создание с карточки, приостановить или отменить. Общий лимит токенов не увеличивается.'
        : 'Сеть NeuralDeep оборвалась, но расход или завершение процесса ещё не подтверждены. Продолжение откроется после сверки, без повтора команд и без увеличения лимита.'};
    }
    return next;
  }
  if(!receipt.blocker && phase==='research' && receipt.processExited && receipt.tokens!==null) {
    next.researchAttemptCompleted=research?.gate.ok===true;
    if(job.researchProtocolVersion===2 && !next.researchAttemptCompleted && research?.remaining?.length===0) {
      // A tool-free evidence selector cannot repair a repository/host gate.
      // Preserve valid primary evidence and stop before another paid selection.
      const reasons=(research.gate.reasons||[]).filter(value=>/^[a-z0-9_:-]{1,120}$/i.test(value)).slice(0,8);
      const message='Первоисточники проверены, но обязательная проверка research ещё не пройдена'+(reasons.length?`: ${reasons.join(', ')}`:'.')+'. Работа сохранена; новый запрос модели не устранит эту причину.';
      next.autoContinue=false;
      if(!['paused','cancelled'].includes(next.status)){next.status='blocked';next.blocker={code:'creation_research_gate_blocked',message};}
      return next;
    }
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

/** A no-progress stop asks for a fix. Verified research evidence is that fix and does not repeat the failed model step. */
export function acceptVerifiedResearchProgress(job, options = {}) {
  if (job?.preparationPolicyVersion !== 2 || job.preparationStop?.code !== 'provider_budget_no_progress') return job;
  if (!['paused', 'blocked'].includes(job.status) || job.activeTurnId) return job;
  let research;
  try { research = (options.readResearch || readCreationResearch)(job, options); }
  catch { return job; }
  if (research?.gate?.ok !== true) return job;
  const progressHash = creationSemanticProgress(job, research);
  if (!progressHash || progressHash === job.preparationStop.progressHash) return job;
  const next = structuredClone(job);
  next.preparationStop = null;
  next.researchAttemptCompleted = true;
  next.researchProgress = { checked: research.checked || [], remaining: research.remaining || [] };
  if (['provider_budget_no_progress', 'creation_recovered'].includes(next.blocker?.code)) next.blocker = null;
  if (next.status === 'blocked') next.status = 'paused';
  next.autoContinue = false;
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
