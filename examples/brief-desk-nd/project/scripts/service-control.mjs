import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {spawn,execFileSync} from 'node:child_process';
import {configuration,root} from '../lib-runtime.mjs';
const config=configuration();
fs.mkdirSync(config.dataDir,{recursive:true,mode:0o700});
const receiptFile=path.join(config.dataDir,'service.pid.json');
const endpoint=`http://127.0.0.1:${config.port}/health`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const getReceipt=()=>{try{return JSON.parse(fs.readFileSync(receiptFile,'utf8'));}catch{return null;}};
async function probe(){try{const r=await fetch(endpoint,{signal:AbortSignal.timeout(700)});return r.ok?await r.json():null;}catch{return null;}}
function processIdentity(pid){try{return execFileSync('ps',['-p',String(pid),'-o','lstart=,args='],{encoding:'utf8',timeout:1500}).trim();}catch{return null;}}
function owned(receipt,health){return receipt&&health?.agent==='brief-desk-nd'&&health?.instance===receipt.instance&&health?.pid===receipt.pid&&processIdentity(receipt.pid)===receipt.processIdentity;}
const action=process.argv[2]||'status';
let controlLock=null;
try{
  // SQLite releases this lock even when the controller crashes.
  if(['start','stop'].includes(action)){
    const lockFile=path.join(config.dataDir,'service-control.sqlite');
    controlLock=new DatabaseSync(lockFile);fs.chmodSync(lockFile,0o600);
    controlLock.exec('PRAGMA busy_timeout=6000; BEGIN IMMEDIATE;');
  }
  const health=await probe(),receipt=getReceipt();
  if(action==='status'||action==='plan')console.log(JSON.stringify({ok:true,running:!!health,owned:!!owned(receipt,health),port:config.port,localUrl:endpoint.replace('/health',''),publicUrl:config.publicUrl,service_mode:'process',autostart:'disabled',start:'node scripts/service-control.mjs start',stop:'node scripts/service-control.mjs stop'}));
  else if(action==='start'){
    if(health){if(!owned(receipt,health))throw new Error('Port has an unowned listener; it was left running.');console.log(JSON.stringify({ok:true,running:true,alreadyRunning:true}));}
    else {
      if(receipt&&processIdentity(receipt.pid)===receipt.processIdentity)throw new Error('Owned process exists but is not healthy; inspect its log or stop it first.');
      const instance=crypto.randomUUID();const log=fs.openSync(path.join(config.dataDir,'service.log'),'a',0o600);
      const child=spawn(process.execPath,[path.join(root,'server.mjs'),`--instance=${instance}`],{cwd:root,detached:true,stdio:['ignore',log,log],env:{...process.env,BRIEF_DESK_ND_PORT:String(config.port)}});fs.closeSync(log);child.unref();
      child.on('error',()=>{});
      await sleep(150);const identity=processIdentity(child.pid);
      const saved={pid:child.pid,instance,processIdentity:identity,startedAt:new Date().toISOString(),root};
      fs.writeFileSync(receiptFile,JSON.stringify(saved,null,2),{mode:0o600});
      let ready=false;for(let n=0;n<16;n++){if(owned(saved,await probe())){ready=true;break;}if(!processIdentity(child.pid))break;await sleep(200);}
      if(!ready)throw new Error('Service did not become ready. Inspect .data/service.log.');
      console.log(JSON.stringify({ok:true,running:true,pid:child.pid,port:config.port,publicUrl:config.publicUrl}));
    }
  }else if(action==='stop'){
    if(!receipt||!processIdentity(receipt.pid)){console.log(JSON.stringify({ok:true,running:false}));}
    else {
      if(receipt.root!==root||!receipt.instance||processIdentity(receipt.pid)!==receipt.processIdentity||!receipt.processIdentity.includes(`--instance=${receipt.instance}`))throw new Error('Process ownership changed. No process was stopped.');
      process.kill(receipt.pid,'SIGTERM');
      for(let n=0;n<25;n++){if(processIdentity(receipt.pid)!==receipt.processIdentity)break;await sleep(150);}
      if(processIdentity(receipt.pid)===receipt.processIdentity)throw new Error('Process has not stopped yet.');
      fs.unlinkSync(receiptFile);console.log(JSON.stringify({ok:true,running:false}));
    }
  }else throw new Error('Use plan, status, start or stop.');
}catch(e){console.error(JSON.stringify({ok:false,error:e.message}));process.exitCode=1;}

finally {if(controlLock){try{controlLock.exec('ROLLBACK');}catch{}controlLock.close();}}
