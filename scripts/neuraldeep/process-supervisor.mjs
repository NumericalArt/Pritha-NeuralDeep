import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Socket } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { processSnapshot, processTreeExited, signalCurrentSession } from "./process-snapshot.mjs";

const HERE = fileURLToPath(import.meta.url);
const SIGNALS = new Set(["SIGINT","SIGTERM"]);

/** A private live pipe is the only control address. It cannot target a reused PID. */
export async function spawnSupervisedCli(command, args, options = {}) {
  const child = spawn(process.execPath,[HERE,"--supervise"],{
    cwd: options.cwd, env: options.env, detached: true,
    stdio: options.inherit ? ["inherit","inherit","inherit","pipe","pipe"] : ["pipe","pipe","pipe","pipe","pipe"],
  });
  const control = child.stdio[3], events = child.stdio[4];
  let nonce = null, evidence = null, stockExit = null, supervisorError = null, launchErrorCode = null, closed = false, requestedSignal = null;
  let readyResolve, readyReject;
  const ready = new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  const completion = new Promise(resolve=>child.once("close",(code,signal)=>{
    closed=true;control.destroy();
    let exited=false;
    try { exited=Boolean(evidence && processTreeExited(evidence)); } catch(error) { supervisorError ||= snapshotErrorCode(error); }
    resolve({code:stockExit?.code ?? code,signal:requestedSignal || stockExit?.signal || signal,
      processTreeExited:exited,evidence,error:supervisorError,launchErrorCode});
    readyReject(new Error(supervisorError || "process_supervisor_closed_before_ready"));
  }));
  child.once("error",()=>{supervisorError="process_supervisor_spawn_failed";readyReject(new Error(supervisorError));});
  control.on("error",()=>{if(!closed)supervisorError ||= "process_supervisor_control_lost";});
  events.on("error",()=>{supervisorError ||= "process_supervisor_evidence_lost";});
  let pending="";
  events.setEncoding("utf8");
  events.on("data",chunk=>{
    pending+=chunk;
    if(Buffer.byteLength(pending)>128*1024){supervisorError="process_supervisor_evidence_invalid";control.destroy();return;}
    let end;
    while((end=pending.indexOf("\n"))>=0){
      const raw=pending.slice(0,end);pending=pending.slice(end+1);
      let event;try{event=JSON.parse(raw);}catch{supervisorError="process_supervisor_evidence_invalid";control.destroy();continue;}
      if(event.type==="ready" && !nonce && typeof event.nonce==="string" && event.evidence?.session===child.pid){
        nonce=event.nonce;evidence=event.evidence;readyResolve(evidence);
      } else if(event.nonce!==nonce){supervisorError="process_supervisor_identity_changed";control.destroy();}
      else if(event.type==="tree") {
        evidence=event.evidence;
        try { options.onEvidence?.(evidence); }
        catch { supervisorError="process_supervisor_checkpoint_failed";control.destroy(); }
      }
      else if(event.type==="stock_exit")stockExit={code:event.code,signal:event.signal};
      else if(event.type==="error") {
        supervisorError=String(event.code || "process_supervisor_failed");
        if (/^E[A-Z0-9_]{1,40}$/.test(event.launchCode || "")) launchErrorCode=event.launchCode;
      }
    }
  });
  const timer=setTimeout(()=>{supervisorError="process_supervisor_ready_timeout";control.destroy();readyReject(new Error(supervisorError));},10_000);
  try {
    const initial=await ready;
    // The launcher persists this identity and its dispatch authorization before
    // this pipe permits stock CLI to start. Losing the parent closes the pipe.
    await options.beforeStart?.(initial);
    if(closed || control.destroyed)throw new Error("process_supervisor_control_lost");
    control.write(`${JSON.stringify({type:"start",nonce,command,args,inherit:options.inherit===true})}\n`);
  } catch(error){control.destroy();await completion;throw error;}
  finally{clearTimeout(timer);}
  return {child,completion,evidence,
    stop(signal="SIGTERM"){
      if(!SIGNALS.has(signal))throw new Error("process_signal_invalid");
      if(closed || control.destroyed)return false;
      requestedSignal ||= signal;
      control.write(`${JSON.stringify({type:"stop",nonce,signal})}\n`);return true;
    },
  };
}

function snapshotErrorCode(error) {
  return ["process_snapshot_timeout","process_snapshot_unavailable","process_snapshot_invalid","process_session_owner_invalid"]
    .includes(error?.message) ? error.message : "process_snapshot_unavailable";
}

async function supervise() {
  const nonce=randomUUID(),control=new Socket({fd:3,readable:true,writable:false}),events=new Socket({fd:4,readable:false,writable:true});
  let stock=null,stockExit=null,stockClosed=false,started=false,stopping=false,finished=false,signal=null,grace=null,poll=null;
  const escaped=new Map();let evidence={version:1,session:process.pid,escaped:[],coverage:"observed"};
  events.on("error",()=>{});
  const emit=event=>new Promise(resolve=>{
    if(events.destroyed)return resolve();
    events.write(`${JSON.stringify({...event,nonce})}\n`,()=>resolve());
  });
  const loseCoverage=(error,phase)=>{
    evidence.coverage="unknown";
    if (!evidence.snapshotFailure) {
      evidence.snapshotFailure={code:snapshotErrorCode(error),phase,at:new Date().toISOString()};
      void emit({type:"error",code:evidence.snapshotFailure.code});
    }
  };
  const observe=()=>{
    const snapshot=processSnapshot(),owned=new Set([process.pid]);
    // Only this live supervisor observes ancestry. Persisted receipt identities
    // are never loaded here or used as authority to terminate a process.
    for(const row of snapshot)if(escaped.get(`${row.pid}:${row.started}`) && !row.state.startsWith("Z"))owned.add(row.pid);
    let changed=true;
    while(changed){changed=false;for(const row of snapshot)if(owned.has(row.parent)&&!owned.has(row.pid)){owned.add(row.pid);changed=true;}}
    for(const row of snapshot)if(owned.has(row.pid)&&row.session!==process.pid)escaped.set(`${row.pid}:${row.started}`,{pid:row.pid,started:row.started});
    evidence={...evidence,escaped:[...escaped.values()]};
    return snapshot.filter(row=>(row.session===process.pid || escaped.has(`${row.pid}:${row.started}`)) && row.pid!==process.pid && !row.state.startsWith("Z"));
  };
  const signalEscaped=targetSignal=>{
    const candidates=processSnapshot().filter(row=>escaped.has(`${row.pid}:${row.started}`) && row.session!==process.pid && !row.state.startsWith("Z"));
    for(const saved of candidates){
      // Recheck both birth identities immediately before each individual signal.
      // A detached child may now have parent 1; a reused PID is never sufficient.
      const current=processSnapshot();
      if(!current.some(row=>row.pid===process.pid && row.started===evidence.leaderStarted && row.group===process.pid && row.session===process.pid))throw new Error("process_session_owner_invalid");
      const child=current.find(row=>row.pid===saved.pid && row.started===saved.started && !row.state.startsWith("Z"));
      if(!child || child.session===process.pid)continue;
      try{process.kill(child.pid,targetSignal);}catch(error){if(error.code!=="ESRCH")throw error;}
    }
  };
  const finish=async()=>{
    if(finished)return;finished=true;clearTimeout(grace);clearInterval(poll);
    await Promise.all([process.stdout,process.stderr].map(stream=>new Promise(resolve=>stream.write("",()=>resolve()))));
    await emit({type:"tree",evidence});
    control.destroy();events.end();
    process.removeAllListeners("SIGINT");process.removeAllListeners("SIGTERM");
    if(signal || stockExit?.signal)process.kill(process.pid,signal || stockExit.signal);
    else process.exit(stockExit?.code ?? (started ? 1 : 0));
  };
  const stop=async(value="SIGTERM",preserveStockExit=false)=>{
    if(stopping || finished)return;stopping=true;if(!preserveStockExit)signal=value;
    if(!started)return finish();
    try{observe();await emit({type:"tree",evidence});signalEscaped(value);signalCurrentSession(value);}
    catch(error){loseCoverage(error,"stop");await emit({type:"tree",evidence});process.kill(-process.pid,value);}
    grace=setTimeout(async()=>{
      if(finished)return;
      try{observe();await emit({type:"tree",evidence});signalEscaped("SIGKILL");signalCurrentSession("SIGKILL",{includeLeaderGroup:false});}
      catch(error){loseCoverage(error,"escalation");await emit({type:"tree",evidence});}
      // This exact process is still the session/group leader. This signal never
      // uses a PID loaded from state, a port, a program name or another attempt.
      process.kill(-process.pid,"SIGKILL");
    },3_000);
  };
  process.on("SIGTERM",()=>{void stop("SIGTERM");});process.on("SIGINT",()=>{void stop("SIGINT");});
  control.on("end",()=>{void stop();});control.on("error",()=>{void stop();});
  let pending="";
  control.setEncoding("utf8");
  control.on("data",chunk=>{
    pending+=chunk;if(Buffer.byteLength(pending)>128*1024){void stop();return;}
    let end;
    while((end=pending.indexOf("\n"))>=0){
      const raw=pending.slice(0,end);pending=pending.slice(end+1);let message;
      try{message=JSON.parse(raw);}catch{void stop();continue;}
      if(message.nonce!==nonce){void stop();continue;}
      if(message.type==="stop"){if(SIGNALS.has(message.signal))void stop(message.signal);continue;}
      if(message.type!=="start" || started || stopping || typeof message.command!=="string" || !Array.isArray(message.args)
        || message.args.some(arg=>typeof arg!=="string")){void stop();continue;}
      started=true;
      stock=spawn(message.command,message.args,{cwd:process.cwd(),env:process.env,stdio:message.inherit ? "inherit" : ["pipe","pipe","pipe"]});
      if(!message.inherit){process.stdin.pipe(stock.stdin);stock.stdout.pipe(process.stdout,{end:false});stock.stderr.pipe(process.stderr,{end:false});stock.stdin.on("error",()=>{});}
      stock.once("error",async error=>{await emit({type:"error",code:"stock_cli_spawn_failed",launchCode:error.code});});
      stock.once("exit",async(code,exitSignal)=>{
        stockExit={code,signal:exitSignal};await emit({type:"stock_exit",...stockExit});
        try{if(!observe().length){if(stockClosed)return finish();return;}}catch(error){loseCoverage(error,"stock_exit");}
        void stop("SIGTERM",true);
      });
      stock.once("close",async(code,exitSignal)=>{
        stockClosed=true;
        if(!stockExit){stockExit={code,signal:exitSignal};await emit({type:"stock_exit",...stockExit});}
        try{if(!observe().length)return finish();}catch(error){loseCoverage(error,"stock_close");}
        void stop("SIGTERM",true);
      });
      poll=setInterval(()=>{
        try{const remaining=observe();void emit({type:"tree",evidence});if(stockClosed&&!remaining.length)void finish();}
        catch(error){loseCoverage(error,"poll");void stop();}
      },1_000);
    }
  });
  try{
    const own=processSnapshot().find(row=>row.pid===process.pid);
    if(!own || own.group!==process.pid || own.session!==process.pid)throw new Error("process_session_owner_invalid");
    evidence={...evidence,leaderStarted:own.started};
    await emit({type:"ready",evidence});
  }catch(error){await emit({type:"error",code:snapshotErrorCode(error)});await finish();}
}

if(process.argv[1] && path.resolve(process.argv[1])===HERE && process.argv[2]==="--supervise") {
  await supervise();
}
