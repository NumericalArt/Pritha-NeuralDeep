import {chromium} from 'playwright-core';
import {writeFileSync} from 'node:fs';
const base=process.env.PRITHA_VOICE_E2E_BASE_URL,output=process.env.PRITHA_VOICE_SOAK_REPORT;
if(!base||!output||!['127.0.0.1','localhost'].includes(new URL(base).hostname)||new URL(base).port==='3420')throw new Error('Use an isolated loopback candidate and PRITHA_VOICE_SOAK_REPORT.');
const browser=await chromium.launch({headless:true});let page;const errors=[],samples=[],started=Date.now(),duration=900000;
const headers={'Content-Type':'application/json',Origin:new URL(base).origin};
const original=await (await fetch(`${base}/api/realtime/runtime-settings`)).json();
try{
 await fetch(`${base}/api/realtime/runtime-settings`,{method:'POST',headers,body:JSON.stringify({voiceTransport:'neuraldeep_chained'})});
 const context=await browser.newContext();await context.addInitScript(()=>{
  Object.defineProperty(Object.getPrototypeOf(navigator.mediaDevices),'getUserMedia',{configurable:true,value:async()=>{const context=new AudioContext(),stream=context.createMediaStreamDestination(),source=context.createConstantSource();source.offset.value=0;source.connect(stream);source.start();return stream.stream;}});
 });
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`${base}/voice`);await page.getByRole('button',{name:'Start Listening',exact:true}).click();await page.getByText('NeuralDeep voice connected · experimental',{exact:true}).filter({visible:true}).waitFor();
 const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
 while(Date.now()-started<duration){await page.waitForTimeout(30000);await cdp.send('HeapProfiler.collectGarbage');const metrics=await cdp.send('Performance.getMetrics');const sample={elapsedSeconds:Math.round((Date.now()-started)/1000),heapBytes:metrics.metrics.find(m=>m.name==='JSHeapUsedSize')?.value,connected:await page.getByRole('button',{name:'Stop Listening',exact:true}).count()===1};samples.push(sample);console.log(JSON.stringify(sample));}
 const report={schema:'pritha-voice-idle-soak-v1',seconds:Math.round((Date.now()-started)/1000),engine:'chromium',capture:'synthetic silence',inferenceRequests:0,errors,samples};writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 if(errors.length||samples.some(s=>!s.connected))process.exitCode=1;
}finally{if(page){const stop=page.getByRole('button',{name:'Stop Listening',exact:true});if(await stop.count())await stop.click().catch(()=>{});}await browser.close();await fetch(`${base}/api/realtime/runtime-settings`,{method:'POST',headers,body:JSON.stringify({voiceTransport:original.settings.voiceTransport})});}
