import {creationBriefPrompt} from './creation-preparation.mjs';

const fail = (code, message) => { throw Object.assign(new Error(message), {code, statusCode:409}); };

/** A host-bound content operation, not a general coding/tool turn. */
export function prepareCreationBriefRequest(payload, job, packet) {
  if (job.briefProtocolVersion !== 1 || packet.packet.briefProtocolVersion !== 1 || packet.packet.phase !== 'brief')
    fail('provider_budget_context_changed', 'The brief request protocol changed.');
  return {
    model:payload.model,
    stream:payload.stream === true,
    instructions:creationBriefPrompt(job),
    input:[{role:'user',content:[{type:'input_text',text:packet.text}]}],
    tools:[],
    tool_choice:'none',
    max_output_tokens:Math.min(payload.max_output_tokens ?? job.preparationPolicy.outputTokens, job.preparationPolicy.outputTokens),
    ...(payload.reasoning ? {reasoning:payload.reasoning} : {}),
  };
}

/** Check the complete buffered response before any event reaches Codex. */
export function validateCreationBriefResponse(body, contentType) {
  const text = String(body);
  const events = contentType.includes('text/event-stream')
    ? text.replaceAll('\r\n','\n').split('\n\n').flatMap(block => {
      const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
      return data && data !== '[DONE]' ? [JSON.parse(data)] : [];
    }) : [JSON.parse(text)];
  const allowedItem = item => ['message','reasoning'].includes(item?.type);
  for (const event of events) {
    const response = event.response || event;
    if (Array.isArray(response.output) && response.output.some(item=>!allowedItem(item))
      || event.item && !allowedItem(event.item)
      || /^response\.(?:function_call|custom_tool_call|local_shell_call)/.test(event.type || ''))
      fail('provider_budget_brief_tool_call', 'The brief response attempted a tool call. No command was executed.');
  }
}
