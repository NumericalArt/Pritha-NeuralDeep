import assert from 'node:assert/strict';import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
function route(gateway){const code=ts.transpileModule(readFileSync('interfaces/control-center/src/app/api/codex-chat/v1/events/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};new Function('require','module','exports',code)(id=>id.endsWith('/gateway')?{getCodexChatGateway:()=>gateway}:{apiError:()=>Response.json({error:'unavailable'},{status:503})},module,module.exports);return module.exports.GET;}
test('summary SSE has a bounded initial frame, resumes its cursor and cancellation only closes that subscription',async()=>{
 let calls=0,seen;const GET=route({summaryChanges:async cursor=>{seen=cursor;calls++;return {cursor:'signed-next',changed:['chat_a'],revision:1,reset:false,more:false};}});
 const response=await GET(new Request('http://fixture/api/codex-chat/v1/events',{headers:{'last-event-id':'signed-prior'}}));
 assert.equal(response.headers.get('content-type'),'text/event-stream; charset=utf-8');assert.equal(seen,'signed-prior');
 const reader=response.body.getReader(),first=await reader.read();assert.match(new TextDecoder().decode(first.value),/event: summary.changed/);
 await reader.cancel();await new Promise(resolve=>setTimeout(resolve,1100));assert.equal(calls,1);
 const controller=new AbortController();controller.abort();const aborted=await GET(new Request('http://fixture/api/codex-chat/v1/events',{signal:controller.signal}));
 assert.equal((await aborted.body.getReader().read()).done,true);
});
