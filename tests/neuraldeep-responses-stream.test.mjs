import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ResponsesStreamNormalizer,writeResponseChunk } from '../scripts/neuraldeep/responses-stream.mjs';
import { listenNeuralDeepAdapter,closeNeuralDeepAdapter } from '../scripts/neuraldeep/responses-adapter.mjs';
import { restoreSearchToolsStream } from '../scripts/search/responses-bridge.mjs';
const frame=event=>`data: ${JSON.stringify(event)}\n\n`;
const parse=raw=>raw.split('\n\n').filter(block=>block.startsWith('data: ')&&block!=='data: [DONE]').map(block=>JSON.parse(block.slice(6)));
const message=(text='Привет',id='msg_stream')=>({id,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]});
const completed=output=>({type:'response.completed',response:{id:'response_stream',status:'completed',output,usage:{input_tokens:10,output_tokens:5,total_tokens:15}}});
function fixture(options={}) {const chunks=[];return {chunks,parser:new ResponsesStreamNormalizer({write:async chunk=>chunks.push(chunk),...options})};}
const push=async(parser,...events)=>{for(const event of events)await parser.push(Buffer.from(frame(event)));};
const added=(item=message())=>({type:'response.output_item.added',output_index:0,item:{...item,status:'in_progress',content:[]}});
const delta=(text='Привет')=>({type:'response.output_text.delta',item_id:'msg_stream',output_index:0,content_index:0,delta:text});
const tool={id:'fc_1',type:'function_call',status:'completed',call_id:'call_1',name:'mcp__pritha_search__web_search',arguments:'{"query":"current Node.js"}'};

test('public text arrives before terminal, is not duplicated and retains stable item IDs',async()=>{
  const {parser,chunks}=fixture();await push(parser,added(),delta('При'),delta('вет'));
  let events=parse(chunks.join(''));assert.equal(events.filter(e=>e.type==='response.output_text.delta').map(e=>e.delta).join(''),'Привет');
  assert.ok(!events.some(e=>e.type==='response.completed'||e.type==='response.output_item.done'));
  await push(parser,completed([message('Привет!')]));await parser.flush(parser.finish());
  events=parse(chunks.join(''));assert.equal(events.filter(e=>e.type==='response.output_text.delta').map(e=>e.delta).join(''),'Привет!');
  assert.equal(events.filter(e=>e.type==='response.output_item.added').length,1);
  assert.equal(events.at(-1).response.output[0].id,'msg_stream');assert.deepEqual(events.map(e=>e.sequence_number),events.map((_,i)=>i));
});

test('a streamed public message omitted at completion is recovered without changing its ID',async()=>{
  const {parser,chunks}=fixture();await push(parser,added(),delta(),completed([]));await parser.flush(parser.finish());
  assert.equal(parse(chunks.join('')).at(-1).response.output[0].id,'msg_stream');
});

test('UTF-8 and CRLF framing survive one-byte chunks',async()=>{
  const {parser,chunks}=fixture();const raw=Buffer.from([added(),delta(),completed([message()])].map(frame).join('').replaceAll('\n','\r\n'));
  for(const byte of raw)await parser.push(Buffer.from([byte]));await parser.flush(parser.finish());
  assert.equal(parse(chunks.join('')).at(-1).response.output[0].content[0].text,'Привет');
});

test('mislabelled output text waits for canonical terminal message and never uses the reasoning identity',async()=>{
  const {parser,chunks}=fixture();await push(parser,{type:'response.output_item.added',output_index:0,item:{id:'r_1',type:'reasoning',summary:[]}},
    {...delta('WRONG'),item_id:'r_1'});
  assert.ok(!parse(chunks.join('')).some(e=>e.type==='response.output_text.delta'));
  await push(parser,completed([{id:'r_1',type:'reasoning',summary:[]},message('RIGHT')]));await parser.flush(parser.finish());
  const texts=parse(chunks.join('')).filter(e=>e.type==='response.output_text.delta');assert.deepEqual(texts.map(e=>[e.item_id,e.delta]),[['msg_stream','RIGHT']]);
});

test('an unused message placeholder cannot reject canonical public output on another bridge identity',async()=>{
  const {parser,chunks}=fixture();
  await push(parser,{type:'response.output_item.added',output_index:0,item:{id:'r_1',type:'reasoning',summary:[]}},
    {...added(message('', 'placeholder')),output_index:1},{...delta(''),item_id:'placeholder',output_index:1},
    {...delta('public answer'),item_id:'r_1'});
  assert.ok(!parse(chunks.join('')).some(event=>event.item?.type==='message'||event.type==='response.output_text.delta'));
  await push(parser,completed([{id:'r_1',type:'reasoning',summary:[]},message('public answer','canonical')]));
  await parser.flush(parser.finish());
  const events=parse(chunks.join(''));
  assert.equal(events.filter(event=>event.type==='response.output_item.added'&&event.item?.type==='message').length,1);
  assert.equal(events.at(-1).response.output[1].id,'canonical');
});

for(const terminalId of ['bridge-final',null])test(`one exact public text can reconcile a terminal message alias: ${terminalId}`,async()=>{
  const {parser,chunks}=fixture();await push(parser,added(),delta());
  const final=message();if(terminalId)final.id=terminalId;else delete final.id;
  await push(parser,completed([final]));await parser.flush(parser.finish());
  const events=parse(chunks.join(''));
  assert.equal(events.at(-1).response.output[0].id,'msg_stream');
  assert.equal(events.filter(event=>event.type==='response.output_text.delta').map(event=>event.delta).join(''),'Привет');
  assert.equal(events.filter(event=>event.type==='response.output_item.added').length,1);
});

test('renamed partial or ambiguous public text cannot authorize terminal identity repair',async()=>{
  const changed=fixture();await push(changed.parser,added(),delta('При'),completed([message('Привет','renamed')]));
  assert.throws(()=>changed.parser.finish(),error=>error.code==='neuraldeep_stream_identity');
  const ambiguous=fixture();await push(ambiguous.parser,added(),delta(),
    {...added(message('Привет','second')),output_index:1},{...delta(),item_id:'second',output_index:1},
    completed([message('Привет','renamed-a'),message('Привет','renamed-b')]));
  assert.throws(()=>ambiguous.parser.finish(),error=>error.code==='neuraldeep_stream_identity');
  assert.ok(!ambiguous.chunks.join('').includes('response.completed'));
});

test('reasoning-only is an empty-response failure while its terminal usage remains available',async()=>{
  let terminal;const {parser,chunks}=fixture({onTerminal:event=>terminal=event});
  await push(parser,{type:'response.reasoning_text.delta',item_id:'r',delta:'private fixture'},completed([{type:'reasoning',id:'r',summary:[]}]));
  assert.throws(()=>parser.finish(),error=>error.code==='neuraldeep_empty_response');
  assert.equal(terminal.response.usage.total_tokens,15);assert.ok(!parse(chunks.join('')).some(e=>e.type==='response.output_text.delta'));
});

for(const missingSnapshot of [false,true])test(`tools wait for terminal+EOF and namespace is restored, omitted snapshot=${missingSnapshot}`,async()=>{
  const {parser,chunks}=fixture({transform:restoreSearchToolsStream});
  await push(parser,{type:'response.output_item.added',output_index:0,item:{...tool,arguments:'',status:'in_progress'}},
    {type:'response.function_call_arguments.delta',item_id:tool.id,output_index:0,delta:'{"query":'},
    {type:'response.output_item.done',output_index:0,item:tool});
  assert.equal(chunks.length,0);
  await push(parser,completed(missingSnapshot?[]:[tool]));assert.equal(chunks.length,0);
  const terminal=parser.finish();assert.equal(chunks.length,0);await parser.flush(terminal);
  const events=parse(chunks.join('')),done=events.find(e=>e.type==='response.output_item.done');
  assert.equal(done.item.namespace,'mcp__pritha_search');assert.equal(done.item.name,'web_search');
  assert.deepEqual(JSON.parse(done.item.arguments),{query:'current Node.js'});assert.equal(events.filter(e=>e.type==='response.output_item.done').length,1);
});

test('malformed complete tool arguments cannot dispatch even alongside a valid public answer',async()=>{
  const {parser,chunks}=fixture();await push(parser,added(),delta(),completed([message(),{...tool,arguments:'{"query":'}]));
  assert.throws(()=>parser.finish(),error=>error.code==='neuraldeep_tool_arguments');
  assert.ok(!parse(chunks.join('')).some(e=>e.type==='response.output_item.done'||e.type==='response.completed'));
});

for(const type of ['response.incomplete','response.failed','response.cancelled'])test(`${type} cannot dispatch a partially received tool`,async()=>{
  const {parser,chunks}=fixture();await push(parser,{type:'response.output_item.done',output_index:0,item:tool},
    {type,response:{status:type.slice(9),output:[],incomplete_details:{reason:'max_output_tokens'}}});
  await parser.flush(parser.finish());const events=parse(chunks.join(''));assert.deepEqual(events.map(e=>e.type),[type]);
});

for(const [name,chunk,code] of [['malformed','data: {\n\n','neuraldeep_stream_malformed'],['oversize','data: '+ 'x'.repeat(50),'neuraldeep_stream_size'],['UTF-8',Buffer.from([0xff]),'neuraldeep_stream_encoding']])test(`rejects ${name} without raw provider content in the error`,async()=>{
  const {parser}=fixture({maxFrameBytes:40});await assert.rejects(()=>parser.push(Buffer.from(chunk)),error=>error.code===code && !error.message.includes('xxxxx'));
});

test('truncated event, missing terminal and changed final public text never become completed',async()=>{
  for(const suffix of ['','data: {']) {
    const {parser,chunks}=fixture();await push(parser,added(),delta());if(suffix)await parser.push(Buffer.from(suffix));
    assert.throws(()=>parser.finish(),error=>error.code==='neuraldeep_stream_truncated');assert.ok(!chunks.join('').includes('response.completed'));
  }
  const {parser}=fixture();await push(parser,added(),delta(),completed([message('different')]));
  assert.throws(()=>parser.finish(),error=>error.code==='neuraldeep_stream_text_changed');
});

test('backpressure waits for drain and cancellation removes owned listeners',async()=>{
  const response=Object.assign(new EventEmitter(),{write:()=>false,destroyed:false}),controller=new AbortController();let settled=false;
  const waiting=writeResponseChunk(response,'data',controller.signal).then(()=>settled=true);await Promise.resolve();assert.equal(settled,false);
  response.emit('drain');await waiting;assert.equal(settled,true);assert.equal(response.listenerCount('close'),0);
  const cancelled=writeResponseChunk(response,'data',controller.signal);controller.abort(new Error('owned cancellation'));
  await assert.rejects(cancelled,/owned cancellation/);assert.equal(response.listenerCount('drain'),0);assert.equal(response.listenerCount('close'),0);
});

test('HTTP adapter streams public bytes before EOF and settles before complete tool delivery',async t=>{
  const release=Promise.withResolvers(),observed=[],progress=[];let paidRequests=0;
  const server=await listenNeuralDeepAdapter({port:0,onRequest:e=>observed.push(e),onProgress:e=>progress.push(e),fetchImpl:async()=>{
    paidRequests++;return {ok:true,status:200,headers:new Headers({'content-type':'text/event-stream'}),body:(async function*(){
      yield Buffer.from(frame(added())+frame(delta()));await release.promise;yield Buffer.from(frame(completed([message(),tool])));
    })()};
  }});
  t.after(async()=>{release.resolve();await closeNeuralDeepAdapter(server);});
  const response=await fetch(`http://127.0.0.1:${server.address().port}/v1/responses`,{method:'POST',body:'{}'}),reader=response.body.getReader();
  let raw='';while(!raw.includes('Привет')){const {value,done}=await reader.read();assert.equal(done,false);raw+=Buffer.from(value).toString();}
  assert.equal(observed.length,0);assert.ok(!raw.includes('response.completed'));release.resolve();
  while(true){const {value,done}=await reader.read();if(done)break;raw+=Buffer.from(value).toString();if(raw.includes('function_call'))assert.equal(observed.length,1);}
  assert.equal(paidRequests,1);assert.equal(observed[0].usage.totalTokens,15);assert.equal(observed[0].error,null);
  assert.ok(progress.some(e=>e.state==='receiving'));assert.equal(progress.at(-1).state,'finished');
  assert.doesNotMatch(JSON.stringify(progress),/Привет|current Node|query|arguments/);
});

test('HTTP truncated partial text has an explicit terminal failure and unresolved usage',async t=>{
  let calls=0;const observed=[];const server=await listenNeuralDeepAdapter({port:0,onRequest:e=>observed.push(e),fetchImpl:async()=>{
    calls++;return new Response(frame(added())+frame(delta())+'data: {', {headers:{'content-type':'text/event-stream'}});
  }});t.after(()=>closeNeuralDeepAdapter(server));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/v1/responses`,{method:'POST',body:'{}'}),raw=await response.text();
  assert.ok(raw.includes('response.failed'));assert.ok(!raw.includes('response.completed'));
  assert.equal(observed[0].usage,null);assert.equal(observed[0].error.code,'neuraldeep_stream_truncated');assert.equal(calls,1);
});

test('host response validation keeps tool-free preparation buffered',async t=>{
  let validated=0;const server=await listenNeuralDeepAdapter({port:0,validateResponsesResponse:()=>{validated++;throw Object.assign(new Error('tools prohibited'),{code:'provider_budget_brief_tool_call',statusCode:409});},
    fetchImpl:async()=>new Response(frame(added())+frame(delta())+frame(completed([message(),tool])),{headers:{'content-type':'text/event-stream'}})});
  t.after(()=>closeNeuralDeepAdapter(server));const response=await fetch(`http://127.0.0.1:${server.address().port}/v1/responses`,{method:'POST',body:'{}'});
  assert.equal(response.status,409);assert.equal(validated,1);assert.ok(!(await response.text()).includes('Привет'));
});

test('consumer cancellation aborts this request once and preserves unknown usage',async t=>{
  const observed=Promise.withResolvers();let calls=0,aborts=0;
  const server=await listenNeuralDeepAdapter({port:0,onRequest:event=>observed.resolve(event),fetchImpl:async(_url,{signal})=>{
    calls++;return {ok:true,status:200,headers:new Headers({'content-type':'text/event-stream'}),body:(async function*(){
      const cancelled=new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborts++;reject(signal.reason);},{once:true}));
      yield Buffer.from(frame(added())+frame(delta()));await cancelled;
    })()};
  }});t.after(()=>closeNeuralDeepAdapter(server));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/v1/responses`,{method:'POST',body:'{}'});
  const reader=response.body.getReader();await reader.read();await reader.cancel();const event=await observed.promise;
  assert.equal(event.cancellationReason,'client_disconnect');assert.equal(event.usage,null);assert.equal(event.error.class,'control');assert.equal(calls,1);assert.equal(aborts,1);
});
