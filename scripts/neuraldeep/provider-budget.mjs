import {createHash} from 'node:crypto';
import {creationPreparationUsage,preparationPhase,assertPreparationPolicy} from './creation-preparation-policy.mjs';
import {readCreationContextPacket,creationSemanticProgress} from './creation-context-packet.mjs';
import {readCreationResearch} from './creation-research-context.mjs';
import {reconcileCreationArtifacts} from './agent-creation.mjs';

const OUTPUT_LIMIT = 16_384;
const FRAMING_RESERVE = 8_192;
const fail = (code, message) => { throw Object.assign(new Error(message), { code, statusCode: 409 }); };
const count = value => Number.isSafeInteger(value) && value >= 0;

function assertTextInput(payload) {
  const unbounded = () => fail('provider_budget_input_unbounded', 'This budgeted request requires a supported text-only input.');
  if (payload.previous_response_id || payload.conversation) unbounded();
  const content = value => {
    if (typeof value === 'string') return;
    if (!Array.isArray(value)) unbounded();
    for (const part of value) {
      if (!part || !['input_text', 'output_text', 'summary_text', 'reasoning_text', 'refusal'].includes(part.type)
        || typeof (part.type === 'refusal' ? part.refusal : part.text) !== 'string') unbounded();
    }
  };
  if (payload.input == null || typeof payload.input === 'string') return;
  if (!Array.isArray(payload.input)) unbounded();
  for (const item of payload.input) {
    if (!item || typeof item !== 'object' || item.encrypted_content) unbounded();
    if (item.type === 'message' || (!item.type && item.role)) content(item.content);
    else if (item.type === 'function_call') { if (typeof item.arguments !== 'string') unbounded(); }
    else if (item.type === 'custom_tool_call') { if (typeof item.input !== 'string') unbounded(); }
    else if (['function_call_output', 'custom_tool_call_output'].includes(item.type)) content(item.output);
    else if (item.type === 'reasoning') { content(item.summary || []); if (item.content != null) content(item.content); }
    else unbounded();
  }
}

function assertLocalTools(tools) {
  if (tools == null) return;
  if (!Array.isArray(tools)) fail('provider_budget_invalid', 'Invalid request tools.');
  for (const tool of tools) {
    // Namespace definitions and JSON schemas are serialized text, not inputs.
    // Inspect only executable tool kinds; never interpret schema property names.
    if (tool?.type === 'namespace' && Array.isArray(tool.tools)) assertLocalTools(tool.tools);
    else if (!['function', 'custom'].includes(tool?.type))
      fail('provider_budget_input_unbounded', 'Provider-hosted tools require a separate bounded budget.');
  }
}

// This is a conservative dispatch reservation, never a measured usage receipt.
// Remote/media inputs cannot be bounded by the serialized text and fail closed.
export function prepareBudgetedRequest(payload, available) {
  if (!count(available)) fail('provider_budget_invalid', 'The remaining request budget is unavailable.');
  assertTextInput(payload);
  assertLocalTools(payload.tools);
  if (payload.max_output_tokens !== undefined && (!count(payload.max_output_tokens) || payload.max_output_tokens < 1))
    fail('provider_budget_invalid', 'Invalid response token limit.');
  const inputReservation = Buffer.byteLength(JSON.stringify(payload)) + FRAMING_RESERVE;
  const output = Math.min(payload.max_output_tokens ?? OUTPUT_LIMIT, OUTPUT_LIMIT, available - inputReservation - 64);
  if (output < Math.min(payload.max_output_tokens ?? OUTPUT_LIMIT,1_024)) fail('provider_token_budget', 'The remaining token budget cannot cover this request and a bounded response.');
  return { ...payload, max_output_tokens: output };
}

/** The creation binding comes only from the already verified host admission. */
export function providerBudgetGate(store, { runId, workloadId, creation, tokenBudget } = {}) {
  if (tokenBudget !== undefined && (!count(tokenBudget) || tokenBudget < 1)) fail('provider_budget_invalid', 'Invalid host token budget.');
  if (!creation && tokenBudget === undefined) return null;
  let current=null;
  const remaining = () => {
    let limit = tokenBudget ?? Number.MAX_SAFE_INTEGER;
    let used = 0;
    let runs = [{ id: runId }];
    if (creation) {
      const row = store.db.prepare('SELECT record FROM agent_creation_jobs WHERE chat_id=?').get(creation.chatId);
      const job = row && JSON.parse(row.record);
      if (!job || job.jobId !== creation.jobId || job.releaseSha !== creation.releaseSha
        || (job.generation ?? 1) !== creation.generation || job.activeTurnId !== workloadId
        || job.status !== 'running' || job.budget.turns[workloadId]) fail('provider_budget_owner_changed', 'The owning creation step is no longer active.');
      if (!count(job.budget.maxTokens) || !count(job.budget.tokensUsed)) fail('provider_budget_invalid', 'Invalid creation accounting.');
      if (job.budget.unknownAttempts.length) fail('provider_usage_unconfirmed', 'Previous creation accounting is unresolved.');
      if(job.preparationPolicyVersion===2) {
        assertPreparationPolicy(job);
        const binding=creation.preparation,phase=preparationPhase(job.phase);
        if(!binding || binding.policyVersion!==2 || binding.phase!==phase || binding.workUnitId!==workloadId
          || binding.packetHash!==job.contextPacket?.hash || job.contextPacket.workUnitId!==workloadId || job.phase==='outcome')
          fail('provider_budget_context_changed','The host preparation binding changed.');
        try {
          readCreationContextPacket(job,{stateRoot:creation.stateRoot});
          const checked=reconcileCreationArtifacts(job,{root:creation.codeRoot,stateRoot:creation.stateRoot});
          if(checked.blocker || ['contract','outcome'].some(kind=>job.approvals[kind] && checked.approvals[kind]?.hash!==job.approvals[kind].hash))throw new Error();
        } catch {fail('provider_budget_documents_changed','The document, approval or context packet is no longer current.');}
        const usage=creationPreparationUsage(store,job);
        if(usage.unknownRequests || usage.pendingRequests)fail('provider_usage_unconfirmed','A previous preparation request has unresolved usage.');
        if(usage.requests>=job.preparationPolicy.maxRequests)fail('provider_budget_preparation_requests','Preparation reached its request count limit.');
        const previousRuns=store.db.prepare('SELECT id,receipt FROM runtime_receipts').all().filter(row=>{
          const receipt=JSON.parse(row.receipt);return row.id!==runId && (receipt.workload_id===workloadId || job.budget.turns[receipt.workload_id]?.dispatched);
        });
        if(previousRuns.some(row=>{const receipt=JSON.parse(row.receipt);return !receipt.process_exited || !receipt.process_tree_exited || !receipt.adapter_closed;}))
          fail('provider_budget_execution_unsettled','The previous process tree has not exited.');
        let research=null;
        if(phase==='research') {
          try{research=readCreationResearch(job,{root:creation.codeRoot,stateRoot:creation.stateRoot});}
          catch{fail('provider_budget_research_changed','Research evidence failed validation.');}
        }
        current={job,phase,usage,progressHash:creationSemanticProgress(job,research)};
        const totalAvailable=Math.max(0,job.budget.maxTokens-usage.confirmedTotal);
        return Math.max(0,Math.min(limit,totalAvailable,usage.remaining,usage.phaseRemaining[phase]));
      }
      limit = Math.min(limit, job.budget.maxTokens - job.budget.tokensUsed);
      runs = store.db.prepare("SELECT id FROM runtime_receipts WHERE json_extract(receipt,'$.workload_id')=?").all(workloadId);
    }
    for (const run of runs) {
      const observed = store.providerUsageSummary(run.id);
      if (observed.unknownRequests) fail('provider_usage_unconfirmed', 'Previous provider response accounting is unresolved.');
      used += observed.usage.totalTokens;
      if (!count(used)) fail('provider_budget_invalid', 'Provider usage overflow.');
    }
    return Math.max(0, limit - used);
  };
  const checkRequest=(payload,persist=true)=>{
    if(!current)return;
    const bytes=Buffer.byteLength(JSON.stringify(payload)),policy=current.job.preparationPolicy;
    const requestCount=store.providerUsageSummary(runId).providerRequests;
    const state={policyVersion:2,phase:current.phase,workUnitId:workloadId,packetHash:current.job.contextPacket.hash,
      bytes,reservation:bytes+FRAMING_RESERVE+(payload.max_output_tokens||policy.outputTokens),
      outputLimit:payload.max_output_tokens||policy.outputTokens,progressHash:current.progressHash,preparedAt:new Date().toISOString()};
    if(persist)store.updateRuntimeRun(runId,{preparation:state});
    if(bytes>policy.hardBytes)fail('provider_budget_context_hard','Preparation request exceeds 128 KiB; no provider call was made.');
    if(!requestCount && bytes>policy.freshBytes)fail('provider_budget_context_initial','The full initial request exceeds 64 KiB; requirements were preserved.');
    if(requestCount && bytes>=policy.rotationBytes)fail('provider_budget_context_boundary','Preparation reached the 96 KiB checkpoint boundary.');
    const calls=Array.isArray(payload.input)?payload.input.filter(item=>['function_call','custom_tool_call'].includes(item.type)):[];
    const readCounts={};
    for(const call of calls) {
      const input=String(call.arguments ?? call.input ?? '');
      if(!/creation-context-reader|\b(?:cat|sed|head|tail|read_file)\b/.test(input))continue;
      const signature=createHash('sha256').update(String(call.name)+input.replace(/\s+/g,' ').trim()).digest('hex');
      readCounts[signature]=(readCounts[signature]||0)+1;
    }
    const previous=store.db.prepare('SELECT metadata FROM provider_dispatches WHERE run_id=? ORDER BY rowid DESC LIMIT 1').get(runId);
    const previousBudget=previous?JSON.parse(previous.metadata).budget:null;
    current.readCounts=readCounts;
    const newRepeatedRead=Object.entries(readCounts).some(([signature,count])=>count>1 && count>(previousBudget?.readCounts?.[signature]||0));
    if(newRepeatedRead && previousBudget?.progressHash===current.progressHash)
      fail('provider_budget_no_progress','Repeated reads produced no verified preparation progress.');
  };
  return {
    prepare: payload => {
      const available=remaining();
      if(current) {
        payload={...payload,max_output_tokens:Math.min(payload.max_output_tokens ?? current.job.preparationPolicy.outputTokens,current.job.preparationPolicy.outputTokens)};
        checkRequest(payload);
      }
      try{const bounded=prepareBudgetedRequest(payload,available);if(current)checkRequest(bounded);return bounded;}
      catch(error){if(current && error.code==='provider_token_budget')fail('provider_budget_preparation_tokens','The remaining phase budget cannot cover the complete request and bounded response.');throw error;}
    },
    claim: event => store.claimProviderRequest(runId, event.requestHash, {}, () => {
      const available = remaining();
      checkRequest(event.payload,false);
      const output = event.payload?.max_output_tokens;
      const reserved = event.bytes + FRAMING_RESERVE + output;
      if (!count(output) || output < 1 || output > OUTPUT_LIMIT || !count(reserved) || reserved > available)
        fail('provider_token_budget', 'The remaining token budget cannot cover this request and a bounded response.');
      if(current && (output>current.job.preparationPolicy.outputTokens || event.bytes!==Buffer.byteLength(JSON.stringify(event.payload))))fail('provider_budget_preparation_invalid','Preparation request or response bound changed.');
      return { model: event.model, bytes: event.bytes,
        ...(current?{creation:{jobId:current.job.jobId,generation:current.job.generation,...creation.preparation}}:{}),
        budget: { reservation: reserved, outputLimit: output, available, basis: 'utf8-text-plus-framing-v1',...(current?{progressHash:current.progressHash,readCounts:current.readCounts}:{}) } };
    }),
  };
}
