/** Provider declarations are not evidence of successful product/tool/transport trials. */
export function neuralDeepExecutionProfile(modelId) {
 const qwen=/^qwen3\.(?:6|8)(?:-|$)/i.test(modelId),noreason=/-noreason$/.test(modelId),oss=modelId==='gpt-oss-120b';
 return {version:1,modelId,wireApi:'responses',source:'https://neuraldeep.ru/llms-full.txt',checkedAt:'2026-09-23',
  effortControl:qwen?'ignored':oss?'documented':'unverified',supportedEfforts:oss?['low','medium','high']:['none'],
  thinking:noreason?'disabled-by-selected-alias':qwen?'provider-default-enabled':'provider-default',
  thinkingBudgetControl:'not-verified-for-responses',transportVerified:false,
  declaredContextTokens:qwen?262144:oss?131072:null,
  applicationOutputCap:8192,reservationBasis:'utf8-text-plus-framing-v1',
  note:qwen?'Qwen ignores reasoning_effort. No effort parameter does not disable thinking; a noreason alias must be selected explicitly.':
   oss?'Effort is documented by the provider; Responses transport and phase quality still need acceptance evidence.':'Effort control has not been verified for this Responses route.'};
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
