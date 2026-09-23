import { createHash } from 'node:crypto';
import { canonicalMessageEvents, completedOutput, outputTextParts, parseSseData } from './responses-normalizer.mjs';

const terminalTypes=new Set(['response.completed','response.failed','response.incomplete','response.cancelled']);
const toolTypes=new Set(['function_call','custom_tool_call','local_shell_call']);
const fail=(code,message)=>{throw Object.assign(new Error(message),{code,statusCode:502});};
const frame=event=>`data: ${JSON.stringify(event)}\n\n`;

/** Respect writable backpressure and cancellation without leaving drain listeners. */
export async function writeResponseChunk(response,chunk,signal) {
  if(signal?.aborted)throw signal.reason;
  if(response.destroyed)fail('client_disconnect','The Responses consumer disconnected.');
  if(response.write(chunk))return;
  await new Promise((resolve,reject)=>{
    const cleanup=()=>{response.off('drain',drain);response.off('close',closed);response.off('error',failed);signal?.removeEventListener('abort',aborted);};
    const drain=()=>{cleanup();resolve();};
    const failed=error=>{cleanup();reject(error);};
    const closed=()=>failed(Object.assign(new Error('The Responses consumer disconnected.'),{code:'client_disconnect'}));
    const aborted=()=>failed(signal.reason);
    response.once('drain',drain);response.once('close',closed);response.once('error',failed);signal?.addEventListener('abort',aborted,{once:true});
    if(signal?.aborted)aborted();
    else if(response.destroyed)closed();
  });
}

/** Only explicit public message deltas stream early. Tools and completion wait
 * for a valid terminal snapshot, end-of-body and durable request accounting. */
export class ResponsesStreamNormalizer {
  constructor({write,transform,onTerminal,maxBytes=32*1024*1024,maxFrameBytes=Math.min(maxBytes,8*1024*1024)}={}) {
    Object.assign(this,{write,transform,onTerminal,maxBytes,maxFrameBytes});
    this.decoder=new TextDecoder('utf-8',{fatal:true});this.buffer='';this.bytes=0;this.sequence=0;
    this.messages=new Map();this.source=[];this.terminal=null;this.responseId=null;this.done=false;this.events=0;
  }
  emit(event){return this.write(frame({...event,sequence_number:this.sequence++}));}
  async push(chunk) {
    this.bytes+=chunk.length;
    if(this.bytes>this.maxBytes)fail('neuraldeep_stream_size','The Responses stream exceeds the bounded response size.');
    try {this.buffer+=this.decoder.decode(chunk,{stream:true});}
    catch {fail('neuraldeep_stream_encoding','The Responses stream contains invalid UTF-8.');}
    // Normalize complete CRLF pairs, including pairs split across chunks.
    this.buffer=this.buffer.replaceAll('\r\n','\n');
    let end;
    while((end=this.buffer.indexOf('\n\n'))!==-1) {
      const block=this.buffer.slice(0,end);this.buffer=this.buffer.slice(end+2);
      if(Buffer.byteLength(block)>this.maxFrameBytes)fail('neuraldeep_stream_size','A Responses event exceeds its bounded size.');
      await this.block(block);
    }
    if(Buffer.byteLength(this.buffer)>this.maxFrameBytes)fail('neuraldeep_stream_size','A Responses event exceeds its bounded size.');
  }
  async block(block) {
    const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
    if(!data)return;
    if(data==='[DONE]') {if(!this.terminal)fail('neuraldeep_stream_truncated','The Responses stream ended without a terminal event.');this.done=true;return;}
    if(this.done || this.terminal)fail('neuraldeep_stream_order','The Responses stream has data after its terminal event.');
    if(++this.events>100000)fail('neuraldeep_stream_size','Too many Responses events.');
    let event;
    try {
      event=JSON.parse(data);
      if(this.transform)event=parseSseData(this.transform(frame(event)))[0];
    } catch {fail('neuraldeep_stream_malformed','The Responses stream contains a malformed event.');}
    if(!event || typeof event.type!=='string')fail('neuraldeep_stream_malformed','The Responses stream contains an invalid event.');
    if(terminalTypes.has(event.type)) {
      this.terminal=event;this.onTerminal?.(event);return;
    }
    if(event.type==='response.created' || event.type==='response.in_progress') {
      this.responseId=event.response?.id || this.responseId;
      await this.emit(event);return;
    }
    if(event.type==='response.output_item.added' && event.item?.type==='message') {
      if(!Number.isSafeInteger(event.output_index) || event.output_index<0 || this.messages.has(event.output_index))fail('neuraldeep_stream_identity','Ambiguous public message identity.');
      const id=typeof event.item.id==='string'?event.item.id:`msg_nd_${createHash('sha256').update(JSON.stringify([this.responseId,event.output_index,'stream'])).digest('hex').slice(0,24)}`;
      const message={id,originalId:event.item.id,parts:new Map(),index:event.output_index};
      this.messages.set(event.output_index,message);
      await this.emit({...event,item:{...event.item,id,status:'in_progress',content:[]}});return;
    }
    if(event.type.startsWith('response.output_text.') || event.type.startsWith('response.content_part.') || event.type==='response.output_item.done' && event.item?.type==='message') {
      this.source.push(event);
      if(event.type==='response.output_text.delta') {
        const message=this.messages.get(event.output_index);
        // NeuralDeep's output_text-on-reasoning workaround stays buffered until
        // a canonical terminal message can supply its correct identity.
        if(message && (!event.item_id || event.item_id===message.originalId || event.item_id===message.id)) {
          if(typeof event.delta!=='string')fail('neuraldeep_stream_malformed','Invalid public text delta.');
          const index=event.content_index ?? 0;
          if(!Number.isSafeInteger(index) || index<0 || index>255)fail('neuraldeep_stream_identity','Invalid message content index.');
          if(!message.parts.has(index)) {
            message.parts.set(index,'');
            await this.emit({type:'response.content_part.added',item_id:message.id,output_index:message.index,content_index:index,part:{type:'output_text',text:'',annotations:[],logprobs:[]}});
          }
          message.parts.set(index,message.parts.get(index)+event.delta);
          await this.emit({...event,item_id:message.id,content_index:index});
        }
      }
      return;
    }
    if(toolTypes.has(event.item?.type) || /\.(?:function_call_arguments|custom_tool_call_input)\./.test(event.type)) {
      if(event.type==='response.output_item.done')this.source.push(event);
      return;
    }
    if(event.type.startsWith('response.output_item.') && event.item?.type!=='reasoning')fail('neuraldeep_stream_unsupported_item','Unrecognized output item cannot be streamed safely.');
    // Reasoning events retain their original types; never relabel them public.
    await this.emit(event);
  }
  finish() {
    try {this.buffer+=this.decoder.decode();}catch{fail('neuraldeep_stream_encoding','The Responses stream ends inside UTF-8.');}
    if(this.buffer.trim())fail('neuraldeep_stream_truncated','The Responses stream ends inside an event.');
    if(!this.terminal)fail('neuraldeep_stream_truncated','The Responses stream ended without a terminal event.');
    const terminal=this.terminal;
    if(terminal.type!=='response.completed')return [{...terminal,response:{...terminal.response,
      output:(terminal.response?.output || []).filter(item=>['message','reasoning'].includes(item?.type))}}];
    const recoveredMessages=[...this.messages.values()].filter(message=>message.parts.size && !this.source.some(event=>event.type==='response.output_item.done' && event.item?.id===message.id)).map(message=>({
      type:'response.output_item.done',output_index:message.index,item:{type:'message',id:message.id,role:'assistant',status:'completed',
        content:[...message.parts.entries()].sort(([a],[b])=>a-b).map(([,text])=>({type:'output_text',text,annotations:[]}))}}));
    const output=completedOutput(terminal.response,[...this.source,...recoveredMessages]);
    // A bridge may omit tool output from the terminal snapshot, too. Only a
    // complete done item is recoverable; deltas alone cannot authorize a tool.
    for(const event of this.source)if(event.type==='response.output_item.done' && toolTypes.has(event.item?.type) && !output.some(item=>item.id===event.item.id))output.push(event.item);
    const result=[],seen=new Set();
    for(const [index,item] of output.entries()) {
      if(item?.type==='message') {
        const message=[...this.messages.values()].find(value=>value.id===item.id) || this.messages.get(index);
        if(message) {
          if(seen.has(message.index))fail('neuraldeep_stream_identity','Duplicate terminal public message.');
          seen.add(message.index);
          if(message.originalId && item.id!==message.originalId)fail('neuraldeep_stream_identity','Terminal message identity differs from the streamed message.');
          const parts=outputTextParts(item);
          for(const [contentIndex,text] of message.parts)if(!parts[contentIndex]?.text.startsWith(text))fail('neuraldeep_stream_text_changed','Terminal message differs from its public partial text.');
          output[index]={...item,id:message.id};
          for(const event of canonicalMessageEvents(output[index],message.index)) {
            if(event.type==='response.output_item.added')continue;
            const streamed=message.parts.get(event.content_index);
            if(event.type==='response.content_part.added' && streamed!==undefined)continue;
            if(event.type==='response.output_text.delta' && streamed!==undefined) {
              const delta=event.delta.slice(streamed.length);if(delta)result.push({...event,delta});continue;
            }
            result.push(event);
          }
        } else result.push(...canonicalMessageEvents(item,index));
      } else if(toolTypes.has(item?.type)) {
        if(typeof item.id!=='string' || !item.id || !item.call_id && item.type!=='local_shell_call' || item.status && item.status!=='completed')fail('neuraldeep_tool_arguments','A tool response has no complete identity.');
        if(item.type==='function_call') {
          let args;try{args=JSON.parse(item.arguments);}catch{fail('neuraldeep_tool_arguments','Tool arguments are not complete JSON.');}
          if(!args || typeof args!=='object' || Array.isArray(args) || !item.name)fail('neuraldeep_tool_arguments','Tool arguments must be a complete object.');
        }
        if(item.type==='custom_tool_call' && (typeof item.input!=='string' || !item.name))fail('neuraldeep_tool_arguments','Custom tool input is incomplete.');
        if(item.type==='local_shell_call' && (item.action?.type!=='exec' || !Array.isArray(item.action.command) || !item.action.command.length || !item.action.command.every(value=>typeof value==='string')))fail('neuraldeep_tool_arguments','Local shell arguments are incomplete.');
        const field=item.type==='function_call'?'arguments':item.type==='custom_tool_call'?'input':null;
        result.push({type:'response.output_item.added',output_index:index,item:{...item,status:'in_progress',...(field?{[field]:''}:{})}});
        if(field) {
          const type=field==='arguments'?'function_call_arguments':'custom_tool_call_input';
          result.push({type:`response.${type}.delta`,item_id:item.id,output_index:index,delta:item[field]});
          result.push({type:`response.${type}.done`,item_id:item.id,output_index:index,[field]:item[field]});
        }
        result.push({type:'response.output_item.done',output_index:index,item});
      }
    }
    for(const [index] of this.messages)if(!seen.has(index))fail('neuraldeep_stream_identity','A streamed message is missing from the completed result.');
    result.push({...terminal,response:{...terminal.response,output}});return result;
  }
  async flush(events) {for(const event of events)await this.emit(event);await this.write('data: [DONE]\n\n');}
}
