import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import { runSyncProbe } from '../lib/sync-probe.mjs';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { neuralDeepRuntimeConfig, runCodexWithNeuralDeep, buildCodexExecArgs } from '../neuraldeep-codex.mjs';
import { validateResponsesInputs } from './responses-input-policy.mjs';
// Explicit acceptance only: ordinary unit tests never launch the installed CLI.
if(process.argv[2] !== '--synthetic')throw new Error('Use --synthetic for the local fake-provider acceptance.');
const reportIndex=process.argv.indexOf('--report'),reportFile=reportIndex<0?null:path.resolve(process.argv[reportIndex+1]);
const codexBin=process.env.PRITHA_CODEX_BIN || process.env.CODEX_BIN || 'codex';
const sourceRoot=path.resolve(import.meta.dirname,'../..');
for(const key of Object.keys(process.env))if(/^(PRITHA_|TECHSCOPE_|OPENAI_|AZURE_OPENAI_|CHATGPT_|CODEX_HOME$|CODEX_BIN$)/.test(key))delete process.env[key];
Object.assign(process.env,{TECHSCOPE_ROOT:sourceRoot,PRITHA_CODEX_BIN:codexBin});
const version=runSyncProbe(codexBin,['--version'],{timeout:5000,maxBuffer:65536});
if(version.status!==0)throw new Error('stock_cli_unavailable');
const base=mkdtempSync(path.join(os.tmpdir(),'nd-stock-cli-acceptance-'));
const deadline=setTimeout(()=>process.kill(process.pid,'SIGTERM'),90000);deadline.unref();
try {
const state=path.join(base,'state'),home=path.join(base,'home'),cwd=path.join(base,'project');
for(const directory of [state,home,cwd])mkdirSync(directory,{recursive:true,mode:0o700});
function crc(bytes){let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=n>>>1^(n&1?0xedb88320:0);}return(n^0xffffffff)>>>0;}
function chunk(type,data){const typed=Buffer.concat([Buffer.from(type),data]),n=Buffer.alloc(4),c=Buffer.alloc(4);n.writeUInt32BE(data.length);c.writeUInt32BE(crc(typed));return Buffer.concat([n,typed,c]);}
const header=Buffer.alloc(13);header.writeUInt32BE(2);header.writeUInt32BE(2,4);header[8]=8;header[9]=2;
const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255,0,0,0,255,0,0,255,0,0]))),chunk('IEND',Buffer.alloc(0))]);
const image=path.join(cwd,'original.png');writeFileSync(image,bytes,{mode:0o600});
writeFileSync(path.join(cwd,'original.txt'),'ND_SYNTHETIC_ORIGINAL_BYTES_3618',{mode:0o600});
Object.assign(process.env,{PRITHA_STATE_ROOT:state,PRITHA_NEURALDEEP_CODEX_HOME:home,PRITHA_NEURALDEEP_KEYCHAIN_SERVICE:'pritha-fixture-unused-no-key',PRITHA_NEURALDEEP_UPSTREAM_ORIGIN:'https://neuraldeep.invalid',ND_SYNTHETIC_PROVIDER_TOKEN:'synthetic-fixture-only'});
writeFileSync(path.join(home,'config.toml'),`model = "fixture-image-model"\nmodel_provider = "neuraldeep"\napproval_policy = "never"\ncheck_for_update_on_startup = false\n[model_providers.neuraldeep]\nname = "Synthetic NeuralDeep fixture"\nbase_url = "http://127.0.0.1:1/v1"\nwire_api = "responses"\nenv_key = "ND_SYNTHETIC_PROVIDER_TOKEN"\nrequest_max_retries = 0\nstream_max_retries = 0\n`,{mode:0o600});
const runtime=neuralDeepRuntimeConfig(process.env);
const allowed=path.join(base,'allowed'),neighbor=path.join(base,'neighbor');mkdirSync(allowed);mkdirSync(neighbor);
const boundaryScript=`const fs=require('node:fs'),path=require('node:path');const entries=${JSON.stringify([cwd,allowed,neighbor,'/tmp'])};const results=entries.map((dir,i)=>{try{const file=path.join(dir,${JSON.stringify(`nd-boundary-${path.basename(base)}`)});fs.writeFileSync(file,'synthetic');fs.unlinkSync(file);return true;}catch{return false;}});const tmp=process.env.TMPDIR;fs.writeFileSync(path.join(tmp,'owned-temp'),'synthetic');process.stdout.write('BOUNDARY:'+JSON.stringify(results)+':TEMP:'+path.basename(tmp));`;
const quote=value=>`'${String(value).replaceAll("'","'\\''")}'`;
const tempNames=[];
let calls=0;const bodies=[];
globalThis.fetch=async (url,init)=>{
 if(new URL(url).hostname!=='neuraldeep.invalid')throw new Error('fixture_outbound_blocked');
 const payload=JSON.parse(Buffer.from(init.body||'{}').toString());
 if(new URL(url).pathname!=='/v1/responses')return Response.json({});
 calls++;bodies.push(payload);
 if(calls===3 && !JSON.stringify(payload.input).includes('ND_SYNTHETIC_ORIGINAL_BYTES_3618')) throw new Error('fixture_file_not_read');
 if(calls===6||calls===8){const input=JSON.stringify(payload.input);assert.ok(input.includes('BOUNDARY:[true,true,false,false]'),'stock_workspace_boundary_failed');const name=[...input.matchAll(/:TEMP:([A-Za-z0-9._-]+)/g)].at(-1)?.[1];assert.ok(name);tempNames.push(name);}
 const response={id:`fixture-response-${calls}`,object:'response',created_at:Math.floor(Date.now()/1000),status:'completed',model:payload.model,output:[{id:`fixture-message-${calls}`,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'SYNTHETIC_OK',annotations:[]}]}],usage:{input_tokens:10,output_tokens:2,total_tokens:12,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}};
 let middle='';
 if([2,5,7].includes(calls)){const item={id:`fixture-tool-${calls}`,type:'function_call',call_id:`fixture-call-${calls}`,name:'exec_command',arguments:JSON.stringify({cmd:calls===2?'cat original.txt':`${quote(process.execPath)} -e ${quote(boundaryScript)}`,yield_time_ms:1000,max_output_tokens:1000}),status:'completed'};response.output=[item];middle=[{type:'response.output_item.added',output_index:0,item:{...item,status:'in_progress',arguments:''}},{type:'response.function_call_arguments.delta',item_id:item.id,output_index:0,delta:item.arguments},{type:'response.output_item.done',output_index:0,item}].map(e=>`data: ${JSON.stringify(e)}\n\n`).join('');}
 return new Response(`data: ${JSON.stringify({type:'response.created',response:{...response,status:'in_progress',output:[]}})}\n\n${middle}data: ${JSON.stringify({type:'response.completed',response})}\n\ndata: [DONE]\n\n`,{headers:{'content-type':'text/event-stream'}});
};
const options={model:'fixture-image-model',cwd,sandbox:'read-only',network:false,input:'Describe the image in one word.',images:[image],usageSource:'codex-chat',workloadId:'synthetic_image_initial',validateResponsesRequest:payload=>validateResponsesInputs(payload,{model:'fixture-image-model',imagesAllowed:true,imageFormats:['image/png'],expectedImages:[{sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length,mediaType:'image/png'}],requireCurrentImages:true})};
const events=[];options.onEvent=event=>events.push(event);
const result=await runCodexWithNeuralDeep(runtime,buildCodexExecArgs(options),options);
const hash=createHash('sha256').update(bytes).digest('hex');
const resumeEvents=[];
const resumed=await runCodexWithNeuralDeep(runtime,buildCodexExecArgs({...options,images:[],resume:result.sessionId}),{...options,images:[],input:'Use a read-only command to read original.txt.',resume:result.sessionId,workloadId:'synthetic_resume',onEvent:e=>resumeEvents.push(e),validateResponsesRequest:p=>validateResponsesInputs(p,{model:options.model,imagesAllowed:true,imageFormats:['image/png'],hasHistoricalImage:h=>h===hash})});
const attached=await runCodexWithNeuralDeep(runtime,buildCodexExecArgs({...options,resume:result.sessionId}),{...options,resume:result.sessionId,input:'Describe this next image in one word.',workloadId:'synthetic_resume_image'});
const writeOptions={model:options.model,cwd,sandbox:'workspace-write',network:false,input:'Run the synthetic filesystem boundary check.',addDirs:[allowed],usageSource:'codex-chat',workloadId:'synthetic_write_initial'};
const writeInitial=await runCodexWithNeuralDeep(runtime,buildCodexExecArgs(writeOptions),writeOptions);
const writeResumeOptions={...writeOptions,resume:writeInitial.sessionId,workloadId:'synthetic_write_resume'};
const writeResumed=await runCodexWithNeuralDeep(runtime,buildCodexExecArgs(writeResumeOptions),writeResumeOptions);
const all=[result,resumed,attached,writeInitial,writeResumed];
assert.ok(all.every(run=>run.code===0 && !run.signal && run.processTreeExited));
assert.ok(result.sessionId && [result,resumed,attached].every(run=>run.sessionId===result.sessionId));
assert.ok(writeInitial.sessionId && writeInitial.sessionId===writeResumed.sessionId && writeInitial.sessionId!==result.sessionId);
assert.equal(new Set(tempNames).size,2);
assert.ok(resumeEvents.some(event=>event.item?.type==='command_execution' && event.item.exit_code===0));
assert.equal(calls,8);
const report={schema:1,status:'pass',provider:'synthetic-local-only',paidCalls:0,cliVersion:version.stdout.trim(),
  initial:true,exactSessionResume:true,resumeOriginalImage:true,readOnlyFileTool:true,
  workspaceAndAdditionalRootInitialResume:true,neighborAndSharedTmpWritesDenied:true,uniqueOwnedTemporaryDirectories:true,
  allProcessTreesExited:true,providerRequests:calls,verifiedAt:new Date().toISOString()};
if(reportFile)writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.error(JSON.stringify(report));
} finally {clearTimeout(deadline);rmSync(base,{recursive:true,force:true});}
