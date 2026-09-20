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
  return {
    prepare: payload => prepareBudgetedRequest(payload, remaining()),
    claim: event => store.claimProviderRequest(runId, event.requestHash, {}, () => {
      const available = remaining();
      const output = event.payload?.max_output_tokens;
      const reserved = event.bytes + FRAMING_RESERVE + output;
      if (!count(output) || output < 1 || output > OUTPUT_LIMIT || !count(reserved) || reserved > available)
        fail('provider_token_budget', 'The remaining token budget cannot cover this request and a bounded response.');
      return { model: event.model, bytes: event.bytes,
        budget: { reservation: reserved, outputLimit: output, available, basis: 'utf8-text-plus-framing-v1' } };
    }),
  };
}
