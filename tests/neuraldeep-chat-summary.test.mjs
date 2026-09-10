import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,symlinkSync,rmSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';
import {NeuralDeepChatHistoryStore} from '../scripts/neuraldeep/chat-history-store.mjs';
import {readPrivateFilePreview,readPrivateJsonlTail} from '../scripts/neuraldeep/file-preview.mjs';
function fixture(t){const root=mkdtempSync(path.join(os.tmpdir(),'nd-summary-')),options={databasePath:path.join(root,'history.sqlite'),instanceScope:'summary-fixture'};
 const store=new NeuralDeepChatHistoryStore(options);t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});return {root,options,store};}
function chat(id,extra={}){return {chatId:id,clientThreadId:`client_${id}`,providerId:'neuraldeep_cli',stateIdentityHash:'a'.repeat(24),modelId:'fixture',
 title:'Проверка NeuralDeep',preview:'Исходные файлы',group:'my_chats',origin:'chat',createdAt:'2026-09-08T00:00:00.000Z',updatedAt:'2026-09-08T00:00:00.000Z',
 lastStatus:'idle',archived:false,pinned:false,messageReceipts:{},turns:[],taskLinks:[],...extra};}
function turn(id,status='completed'){return {turnId:id,status,startedAt:'2026-09-08T00:00:00.000Z',completedAt:null,pendingRequestIds:[],error:null,
 userMessage:{id:`user_${id}`,markdown:'original '+id,role:'user',status:'completed',createdAt:'2026-09-08T00:00:00.000Z'},items:[]};}

test('indexed list is bounded, Unicode-searchable and never reads originals, full receipts or transcripts',t=>{
 const {store}=fixture(t);
 for(let i=0;i<140;i++)store.put(chat(`chat_${String(i).padStart(3,'0')}`,{pinned:i<2}));
 store.putTurn('chat_000',{...turn('huge'),userMessage:{...turn('huge').userMessage,markdown:'original-only-'.repeat(400000)}});
 for(let i=0;i<501;i++)store.event('chat_000','receipt',{id:`message_${i}`,kind:'message',value:{input:'receipt-only-secret'}});
 const source=store.verifySource();const summaries=store.summaries();
 for(const name of ['get','turn','item','bodyPreview','content'])store[name]=()=>assert.fail(`summary read ${name}`);
 const first=summaries.list({limit:30,search:'ПРОВЕРКА'});assert.equal(first.data.length,30);assert.ok(first.nextCursor);
 assert.ok(Buffer.byteLength(JSON.stringify(first))<64*1024);assert.ok(!JSON.stringify(first).includes('original-only-'));assert.ok(!JSON.stringify(first).includes('receipt-only-secret'));
 assert.equal(first.data[0].pinned,true);const ids=new Set(first.data.map(row=>row.chatId));let cursor=first.nextCursor;
 while(cursor){const page=summaries.list({cursor,search:'ПРОВЕРКА'});for(const row of page.data){assert.ok(!ids.has(row.chatId));ids.add(row.chatId);}cursor=page.nextCursor;}
 assert.equal(ids.size,140);assert.throws(()=>summaries.list({cursor:first.nextCursor,search:'другое'}),{code:'invalid_cursor'});
 assert.deepEqual(store.verifySource(),source);
});

test('a second writer completion, operator question, aliases and projection rebuild reach the global cursor without transcript polling',t=>{
 const {store,options}=fixture(t),identity={nativeThreadId:'native_1',profileIdentity:'profile',identityStatus:'recorded'};
 store.put(chat('chat_a',identity));store.put(chat('chat_alias',{...identity,group:'voice_work',origin:'voice'}));
 store.putTurn('chat_a',turn('turn_a','in_progress'));let summaries=store.summaries(),cursor=summaries.changes().cursor;
 const other=new NeuralDeepChatHistoryStore(options);
 try{other.putTurn('chat_a',turn('turn_a','completed'));other.putTurn('chat_alias',turn('voice_turn','waiting_for_input'));}finally{other.close();}
 const changed=summaries.changes(cursor);assert.deepEqual(new Set(changed.changed),new Set(['chat_a','chat_alias']));
 assert.equal(summaries.list().data.find(row=>row.chatId==='chat_a').execution.state,'completed');assert.equal(summaries.counts().voice_work.attention,1);
 cursor=changed.cursor;store.sourceRaw('chat_a','turn_a','raw-original-only');assert.deepEqual(summaries.changes(cursor).changed,[]);
 const revision=store.get('chat_a').revision;store.archive('chat_a',true,'archive_a',revision);
 assert.equal(summaries.list().data.length,0);assert.equal(summaries.list({archived:true}).data.length,2);assert.ok(summaries.changes(cursor).changed.includes('chat_a'));
 const before=store.verifySource();store.rebuildProjection();summaries=store.summaries();assert.deepEqual(store.verifySource(),before);assert.equal(summaries.list({archived:true}).data.length,2);
 assert.equal(summaries.changes('untrusted-cursor').reset,true);
});

test('summary events have bounded replay and instance/generation cursors',t=>{
 const {store}=fixture(t),other=fixture(t);store.put(chat('chat_a'));const summaries=store.summaries();let cursor=summaries.changes().cursor;
 for(let i=0;i<170;i++)store.putTurn('chat_a',turn(`turn_${i}`));
 const first=summaries.changes(cursor);assert.equal(first.more,true);assert.equal(first.changed.length,1);
 const next=summaries.changes(first.cursor);assert.equal(next.more,false);assert.equal(next.changed.length,1);
 assert.equal(other.store.summaries().changes(first.cursor).reset,true);
});

test('large Voice previews and JSONL tails are bounded and preserve original UTF-8 files',t=>{
 const {root}=fixture(t),file=path.join(root,'result.md'),original='Ю😀'.repeat(1000000);writeFileSync(file,original);
 const preview=readPrivateFilePreview(file,{root,maxBytes:1001});assert.equal(preview.available,true);assert.equal(preview.truncated,true);
 assert.equal(preview.totalBytes,Buffer.byteLength(original));assert.ok(original.startsWith(preview.text));assert.ok(!preview.text.includes('\ufffd'));assert.ok(Buffer.byteLength(preview.text)<=1001);
 const tail=readPrivateFilePreview(file,{root,maxBytes:1001,tail:true});assert.ok(original.endsWith(tail.text));assert.ok(!tail.text.includes('\ufffd'));
 assert.equal(readFileSync(file,'utf8'),original);
 const log=path.join(root,'events.jsonl');writeFileSync(log,Array.from({length:5000},(_,i)=>JSON.stringify({i,text:'event'})).join('\n')+'\n');
 const lines=readPrivateJsonlTail(log,root,1024);assert.equal(JSON.parse(lines.at(-1)).i,4999);assert.ok(lines.length<100);
 const link=path.join(root,'link');symlinkSync(file,link);assert.equal(readPrivateFilePreview(link,{root}).error,'file_preview_unavailable');
 const outside=path.join(root,'sub');mkdirSync(outside);assert.equal(readPrivateFilePreview(file,{root:outside}).available,false);
 assert.equal(readPrivateFilePreview(path.join(root,'missing'),{root}).error,'missing');
});
