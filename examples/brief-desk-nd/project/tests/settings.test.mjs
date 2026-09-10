import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {configuration} from '../lib-runtime.mjs';
import {saveSettings,publicSettings,telegramCheck,neuraldeepCheck} from '../settings.mjs';
import {createBriefDesk} from '../server.mjs';
const syntheticToken='123456:'+ 'x'.repeat(30);
function directory(t){const p=fs.mkdtempSync(path.join(os.tmpdir(),'brief-settings-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p;}
test('settings preserve port and unrelated configuration; keys never return and deletion overrides old env',t=>{
 const dir=directory(t);fs.writeFileSync(path.join(dir,'.env'),'NEURALDEEP_API_KEY=old-fixture\n');
 fs.writeFileSync(path.join(dir,'.env.local'),'BRIEF_DESK_ND_PORT=3488\nCUSTOM_SETTING=keep\n');
 const r=saveSettings({keySource:'own',neuraldeepKey:'fixture-private-key',telegramToken:syntheticToken,chatId:'-100123456'},dir);
 assert.equal(r.neuraldeepConfigured,true);assert.equal(r.telegramReady,true);
 assert.ok(!JSON.stringify(r).includes('fixture-private'));assert.ok(!JSON.stringify(r).includes(syntheticToken));
 let c=configuration({},true,dir);assert.equal(c.port,3488);assert.equal(c.key,'fixture-private-key');
 saveSettings({neuraldeepKey:'',telegramToken:''},dir);assert.equal(configuration({},true,dir).key,c.key);
 saveSettings({removeNeuraldeepKey:true,removeTelegramToken:true},dir);c=configuration({},true,dir);assert.equal(c.key,'');assert.equal(c.token,'');
 assert.match(fs.readFileSync(path.join(dir,'.env.local'),'utf8'),/CUSTOM_SETTING="keep"/);
 if(process.platform!=='win32')assert.equal(fs.statSync(path.join(dir,'.env.local')).mode&0o777,0o600);
});
test('invalid settings leave previous values intact',t=>{
 const dir=directory(t);saveSettings({model:'test-model'},dir);const prior=fs.readFileSync(path.join(dir,'.env.local'),'utf8');
 for(const value of [{telegramToken:'invalid'},{chatId:'../../etc'},{neuraldeepKey:'x\nBAD=x'},{keySource:'unknown'},{model:'a b'},{extra:'value'}])assert.throws(()=>saveSettings(value,dir));
 assert.equal(fs.readFileSync(path.join(dir,'.env.local'),'utf8'),prior);
});
test('parent selection uses a linked credential reference; own selection is independent',t=>{
 const dir=directory(t);fs.mkdirSync(path.join(dir,'.data'));fs.writeFileSync(path.join(dir,'.data','pritha-parent.json'),JSON.stringify({service:'pritha-test-unused'}));
 const c=configuration({PRITHA_NEURALDEEP_API_KEY:'parent-fixture',NEURALDEEP_API_KEY:'own-fixture',BRIEF_DESK_ND_KEY_SOURCE:'pritha'},true,dir);
 assert.equal(c.key,'parent-fixture');assert.equal(c.parentLinked,true);assert.equal(publicSettings(c).ownKeyConfigured,true);
 assert.equal(configuration({NEURALDEEP_API_KEY:'own-fixture',BRIEF_DESK_ND_KEY_SOURCE:'own'},true,dir).key,'own-fixture');
});
test('connection checks never send messages and detect missing channel permissions',async t=>{
 const methods=[];let permitted=true;
 t.mock.method(globalThis,'fetch',async url=>{methods.push(String(url).split('/').pop());const result=String(url).endsWith('getMe')?{id:1,username:'demo_bot'}:String(url).endsWith('getChat')?{id:-1,type:'channel',title:'Demo'}:{status:'administrator',can_post_messages:permitted};return new Response(JSON.stringify({ok:true,result}),{headers:{'Content-Type':'application/json'}});});
 assert.equal((await telegramCheck({token:syntheticToken,chatId:'-1'})).destinationReady,true);
 await neuraldeepCheck({key:'fixture'});permitted=false;await assert.rejects(telegramCheck({token:syntheticToken,chatId:'-1'}));
 assert.ok(!methods.includes('sendMessage'));
});
test('fresh instance is empty; offline demo is idempotent and POST requires CSRF and confirmation',async t=>{
 const dir=directory(t);let sends=0;const c={...configuration({},false),dataDir:dir,port:0,key:'',token:'',chatId:''};
 const app=createBriefDesk(c,{search:()=>{throw Error('network forbidden');},read:()=>{throw Error('network forbidden');},draft:()=>{throw Error('network forbidden');},publish:async()=>{sends++;return {messageId:1};}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));c.port=app.server.address().port;
 t.after(async()=>{app.stop();await new Promise(r=>app.server.close(r));});
 const base=`http://127.0.0.1:${c.port}`;assert.deepEqual(app.status().history,[]);assert.equal(app.status().draftId,null);
 const csrf=(await (await fetch(base+'/api/settings')).json()).csrfToken;
 const request=(route,body={},token=csrf)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-Brief-Desk':'1','X-Brief-Desk-CSRF':token},body:JSON.stringify(body)});
 assert.equal((await request('/api/demo',{},'wrong')).status,403);
 const first=await (await request('/api/demo')).json();const second=await (await request('/api/demo')).json();assert.equal(first.draft.id,second.draft.id);assert.equal(first.draft.demo,true);assert.equal(sends,0);
 assert.equal((await request('/api/settings/telegram/test')).status,403);assert.equal(sends,0);
 assert.equal((await request('/api/settings/telegram/test',{approved:true})).status,200);assert.equal(sends,1);
});
