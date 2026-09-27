/** Provider declarations are not evidence of successful product/tool/transport trials. */
export function neuralDeepExecutionProfile(modelId) {
 const qwen=/^qwen3\.(?:6|8)(?:-|$)/i.test(modelId),kimi=/^kimi-k2\.6(?:-|$)/i.test(modelId),gemma=/^gemma-4(?:-|$)/i.test(modelId),noreason=/-noreason$/.test(modelId),oss=modelId==='gpt-oss-120b';
 return {version:2,modelId,wireApi:'responses',source:'https://neuraldeep.ru/llms-full.txt',checkedAt:'2026-09-23',
  effortControl:qwen?'ignored':oss?'documented':'unverified',supportedEfforts:oss?['low','medium','high']:['none'],
  thinking:noreason?'disabled-by-selected-alias':qwen?'provider-default-enabled':'provider-default',
  thinkingBudgetControl:'not-verified-for-responses',transportVerified:false,
  declaredContextTokens:qwen || gemma?262144:oss?131072:null,
  // Reasoning shares the response budget: a thinking model needs room for the answer after it.
  // Gemma 4 reasons briefly (an Outcome took about 8k tokens) and a longer build response runs past
  // the provider's 15-minute response window at its speed, so it keeps the 16384 cap.
  applicationOutputCap:(qwen || kimi) && !noreason?32768:16384,reservationBasis:'utf8-text-plus-framing-v1',
  note:qwen?'Qwen ignores reasoning_effort. No effort parameter does not disable thinking; a noreason alias must be selected explicitly.':
   oss?'Effort is documented by the provider; Responses transport and phase quality still need acceptance evidence.':
   gemma?'The provider model catalog declares Gemma 4 with tools, reasoning and a 262144-token context; effort control is not verified.':'Effort control has not been verified for this Responses route.'};
}
export function effectiveNeuralDeepEffort(modelId,requested) {
 const profile=neuralDeepExecutionProfile(modelId);
 return profile.supportedEfforts.includes(requested) && requested!=='none'?requested:null;
}
export function normalizeModelExecutionRequest(payload) {
 const profile=neuralDeepExecutionProfile(String(payload.model||''));
 if(profile.effortControl!=='ignored' || !payload.reasoning?.effort)return payload;
 const {effort,...reasoning}=payload.reasoning;
 const {reasoning:previous,...rest}=payload;
 return Object.keys(reasoning).length?{...rest,reasoning}:rest;
}
