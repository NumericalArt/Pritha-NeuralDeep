import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {configuration,providers,root,UserError,suspicious,cleanText,sourceUrl} from './lib-runtime.mjs';
import {renderUI} from './ui.mjs';
import {publicSettings,saveSettings,telegramCheck,neuraldeepCheck} from './settings.mjs';
const BUSY=['searching','fetching','drafting'];
const id=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
export function createBriefDesk(config,injectedIO=null,options={}){
  const csrf=crypto.randomBytes(32).toString('hex');
  const live=options.configuration || (()=>injectedIO ? config : configuration());
  const ioFor=c=>injectedIO || providers(c);
  let testSending=false;
  fs.mkdirSync(config.dataDir,{recursive:true,mode:0o700});
  const file=path.join(config.dataDir,'state.json');
  let state={topics:[],currentDraftId:null,currentStatus:'idle',drafts:{},history:[],quarantineLog:[],requests:{}};
  if(fs.existsSync(file))state={...state,...JSON.parse(fs.readFileSync(file,'utf8'))};
  let running=null;
  function save(){const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(tmp,file);}
  for(const d of Object.values(state.drafts)){
    d.revision ||= 1;
    const priorDeliveries=state.history.filter(h=>h.id===d.id&&h.sentToTelegram===true);
    if(priorDeliveries.length){
      const confirmed=priorDeliveries.some(h=>Number.isSafeInteger(h.messageId)&&h.messageId>0&&h.chatId);
      d.status=confirmed?'published':'legacy_unverified';d.approved=true;
      if(!confirmed)d.error='Старая запись не содержит подтверждения Telegram. Факт публикации неизвестен; автоматическая повторная отправка отключена.';
    }
    if(d.status==='publishing'){d.status='delivery_unknown';d.error='Отправка была прервана. Проверьте канал перед повторной публикацией.';}
    if(BUSY.includes(d.status)){d.status='draft_unavailable';d.error='Сборка прервалась при остановке сервера. Создайте бриф заново.';}
  }
  if(state.drafts[state.currentDraftId])state.currentStatus=state.drafts[state.currentDraftId].status;
  else if(BUSY.includes(state.currentStatus))state.currentStatus='draft_unavailable';
  save();
  const status=()=>{const currentConfig=live();return ({ok:true,status:state.currentStatus,draftId:state.currentDraftId,draft:state.drafts[state.currentDraftId]||null,topics:state.topics.slice(-30),history:state.history.slice(-30).reverse(),drafts:Object.values(state.drafts).slice(-40).reverse().map(d=>({id:d.id,topic:d.topic,title:d.title,status:d.status,createdAt:d.createdAt})),configuration:{search:!!currentConfig.key,telegram:!!currentConfig.token&&!!currentConfig.chatId,model:currentConfig.model,publicUrl:currentConfig.publicUrl},quarantined:state.quarantineLog.length});};
  const update=(d,phase)=>{d.status=phase;d.updatedAt=now();if(state.currentDraftId===d.id)state.currentStatus=phase;save();};
  function quarantine(text,source){if(!suspicious(text))return false;state.quarantineLog.push({id:id(),createdAt:now(),source,count:1});save();return true;}
  async function build(d,signal){
    const currentConfig=live(),io=ioFor(currentConfig);
    try{
      const results=/^https:\/\//i.test(d.topic)?[{url:d.topic,title:d.topic}]:await io.search(d.topic,signal);
      signal.throwIfAborted();update(d,'fetching');
      const sources=[];let skipped=0;
      for(const r of results.slice(0,8)){
        signal.throwIfAborted();
        let u;try{u=sourceUrl(r.url,currentConfig.allowedHosts).href;}catch{skipped++;continue;}
        if(sources.some(s=>s.url===u))continue;
        let page;try{page=await io.read(u,signal);}catch{page=null;}
        signal.throwIfAborted();
        // A search excerpt remains attributable but is labelled as such.
        const text=cleanText(page?.text||r.snippet||'');
        if(text.length<80){skipped++;continue;}
        if(quarantine(text,u)){d.scannerWarnings.push('Один источник исключён проверкой содержимого.');continue;}
        sources.push({url:page?.url||u,title:cleanText(r.title||u).slice(0,160),text,excerpt:!page});
        if(sources.length===4)break;
      }
      d.sources=sources.map(({text,...s})=>s);
      if(skipped)d.scannerWarnings.push('Часть результатов недоступна или вне списка разрешённых сайтов.');
      if(sources.some(s=>s.excerpt))d.scannerWarnings.push('Часть источников доступна только в виде поисковых выдержек.');
      if(!sources.length)throw new UserError('Не удалось получить надёжные источники. Уточните тему или укажите ссылку на разрешённый сайт.');
      update(d,'drafting');
      const result=await io.draft(d.topic,sources,signal);signal.throwIfAborted();
      if(quarantine(JSON.stringify(result),'draft'))throw new UserError('Черновик отклонён проверкой содержимого.');
      d.title=result.title;d.bullets=result.bullets;d.error=null;update(d,'ready');
    }catch(e){d.error=e instanceof UserError?e.message:signal.aborted?'Сборка остановлена или превысила 3 минуты. Можно запустить новую.':'Сервис временно недоступен. Повторите сборку позже.';update(d,'draft_unavailable');}
    finally{if(running?.draftId===d.id)running=null;}
  }
  function start(topic,requestId){
    if(typeof topic!=='string'||!topic.trim()||topic.length>1000)throw new UserError('Введите тему (до 1000 символов).');
    if(typeof requestId!=='string'||!/^[\w-]{8,100}$/.test(requestId))throw new UserError('Не указан идентификатор запроса.');
    topic=topic.trim();
    if(state.requests[requestId]){const d=state.drafts[state.requests[requestId]];if(d.topic!==topic)throw new UserError('Этот запрос уже использован для другой темы.',409);return d;}
    if(running)throw new UserError('Предыдущий бриф ещё собирается. Дождитесь завершения или остановите его.',409);
    const d={id:id(),topic,title:'',bullets:[],sources:[],scannerWarnings:[],status:'searching',revision:1,createdAt:now(),updatedAt:now()};
    state.drafts[d.id]=d;state.requests[requestId]=d.id;state.currentDraftId=d.id;state.currentStatus='searching';
    if(!state.topics.includes(topic))state.topics.push(topic);
    const controller=new AbortController();running={draftId:d.id,controller};save();
    void build(d,AbortSignal.any([controller.signal,AbortSignal.timeout(180000)]));return d;
  }
  const getDraft=draftId=>{if(typeof draftId!=='string'||!draftId)throw new UserError('Выберите конкретный бриф.');const d=state.drafts[draftId];if(!d)throw new UserError('Бриф не найден.',404);return d;};
  function assertEditable(d,revision){if(d.status!=='ready')throw new UserError('Этот бриф нельзя редактировать или публиковать.',409);if(d.revision!==revision)throw new UserError('Бриф изменился. Обновите его перед подтверждением.',409);}
  async function publish(d,revision,approved){
    if(approved!==true)throw new UserError('Для публикации нужно явное подтверждение.',403);
    if(d.status==='published')return {ok:true,replayed:true,entry:state.history.find(h=>h.id===d.id&&h.sentToTelegram===true)};
    assertEditable(d,revision);
    const text=d.title+'\n\n'+d.bullets.map(b=>'• '+b).join('\n\n')+'\n\nИсточники:\n'+d.sources.map((s,i)=>`[${i+1}] ${typeof s==='string'?s:s.url}`).join('\n');
    if(text.length>4000)throw new UserError('Бриф слишком длинный для одного сообщения Telegram. Сократите его до 4000 символов вместе с источниками.');
    const publishConfig=live(),io=ioFor(publishConfig);
    if(!publishConfig.token||!publishConfig.chatId)throw new UserError('Telegram не настроен.',503);
    if(quarantine(text,'publish'))throw new UserError('Проверка содержимого заблокировала отправку.',403);
    update(d,'publishing');
    try{const result=await io.publish(text);d.approved=true;d.publishedAt=now();d.messageId=result.messageId;const entry={id:d.id,topic:d.topic,approvedAt:d.publishedAt,sentToTelegram:true,...result};state.history.push(entry);update(d,'published');return {ok:true,entry};}
    catch(e){d.error='Не получено подтверждение Telegram. Проверьте канал: автоматическая повторная отправка отключена.';update(d,'delivery_unknown');throw new UserError(d.error,502);}
  }
  async function body(req){let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>32000)throw new UserError('Запрос слишком большой.',413);chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw new UserError('Некорректный JSON.');}}
  const server=http.createServer(async(req,res)=>{
    const send=(data,code=200,type='application/json; charset=utf-8')=>{res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"});res.end(type.startsWith('application/json')?JSON.stringify(data):data);};
    try{
      const u=new URL(req.url,'http://localhost');
      const actualPort=server.address()?.port || config.port;
      const hosts=[`127.0.0.1:${actualPort}`,`localhost:${actualPort}`,config.publicUrl?new URL(config.publicUrl).host:null];
      if(!hosts.includes(req.headers.host))throw new UserError('Недопустимый адрес сервиса.',403);
      if(req.method==='GET'){
        if(u.pathname==='/health')return send({ok:true,agent:'brief-desk-nd',version:'0.2.0',pid:process.pid,instance:config.instance||null});
        if(u.pathname==='/')return send(renderUI(),'200','text/html; charset=utf-8');
        if(u.pathname==='/app.js')return send(fs.readFileSync(path.join(root,'app.js'),'utf8'),200,'text/javascript; charset=utf-8');
        if(u.pathname==='/api/settings')return send({...publicSettings(live()),csrfToken:csrf});
        if(u.pathname==='/api/status')return send(status());
        if(u.pathname==='/api/history')return send({ok:true,history:state.history});
        if(u.pathname==='/api/draft')return send({ok:true,draft:getDraft(u.searchParams.get('id'))});
      }
      if(req.method!=='POST')throw new UserError('Страница не найдена.',404);
      if(u.pathname==='/api/telegram-webhook'){
        const secret=req.headers['x-telegram-bot-api-secret-token'];
        if(!config.webhookSecret||secret!==config.webhookSecret)throw new UserError('Webhook не настроен или не подтверждён.',403);
        const b=await body(req);const m=b.message||{};
        if(!config.allowedIds.includes(String(m.from?.id)))return send({ok:true});
        const text=m.text||'';
        if(text==='/status')return send(status());
        if(text.startsWith('/brief '))return send({ok:true,draftId:start(text.slice(7),'telegram-'+b.update_id).id});
        if(/^https:\/\//.test(text))return send({ok:true,draftId:start(text,'telegram-'+b.update_id).id});
        if(text.startsWith('/publish ')){const d=getDraft(text.slice(9).trim());return send(await publish(d,d.revision,true));}
        return send({ok:true});
      }
      const origin=req.headers.origin;
      const validOrigins=[`http://127.0.0.1:${config.port}`,`http://localhost:${config.port}`,config.publicUrl?new URL(config.publicUrl).origin:null];
      if(req.headers['x-brief-desk']!=='1'||(origin&&!validOrigins.includes(origin)))throw new UserError('Обновите страницу перед выполнением действия.',403);
      if(req.headers['x-brief-desk-csrf']!==csrf)throw new UserError('Обновите страницу перед выполнением действия.',403);
      const b=await body(req);
      if(u.pathname==='/api/settings'){
        if(testSending||Object.values(state.drafts).some(d=>d.status==='publishing'))throw new UserError('Дождитесь завершения отправки.',409);
        return send((options.saveSettings || saveSettings)(b));
      }
      if(u.pathname==='/api/settings/neuraldeep/check')return send(await neuraldeepCheck(live()));
      if(u.pathname==='/api/settings/telegram/check')return send(await telegramCheck(live()));
      if(u.pathname==='/api/settings/telegram/test'){
        if(b.approved!==true)throw new UserError('Подтвердите тестовую отправку.',403);
        if(testSending)throw new UserError('Отправка уже выполняется.',409);
        testSending=true;
        try{return send({ok:true,...await ioFor(live()).publish('Brief Desk ND: проверка подключения по вашей команде.')});}finally{testSending=false;}
      }
      if(u.pathname==='/api/demo'){
        if(running)throw new UserError('Дождитесь завершения сборки.',409);
        let d=Object.values(state.drafts).find(x=>x.demo&&x.status==='ready');
        if(!d){d={...JSON.parse(fs.readFileSync(path.join(root,'demo','brief.json'),'utf8')),id:id(),status:'ready',revision:1,createdAt:now(),updatedAt:now()};state.drafts[d.id]=d;}
        state.currentDraftId=d.id;state.currentStatus=d.status;save();return send({ok:true,draft:d});
      }
      if(u.pathname==='/api/brief'){const d=start(b.topic,b.requestId);return send({ok:true,draftId:d.id,status:d.status},202);}
      if(u.pathname==='/api/cancel'){if(running){running.controller.abort();}return send({ok:true});}
      if(u.pathname==='/api/edit'){
        const d=getDraft(b.draftId);assertEditable(d,b.revision);
        if(typeof b.title!=='string'||!b.title.trim()||b.title.length>200||!Array.isArray(b.bullets)||!b.bullets.length||b.bullets.length>12||b.bullets.some(x=>typeof x!=='string'||!x.trim()||x.length>800))throw new UserError('Проверьте заголовок и пункты брифа.');
        d.title=b.title.trim();d.bullets=b.bullets.map(x=>x.trim());d.revision++;save();return send({ok:true,draft:d});
      }
      if(u.pathname==='/api/approve')return send(await publish(getDraft(b.draftId),b.revision,b.approved));
      if(u.pathname==='/api/reject'){const d=getDraft(b.draftId);if(['publishing','published','delivery_unknown','legacy_unverified',...BUSY].includes(d.status))throw new UserError('Этот бриф сейчас нельзя отклонить.',409);update(d,'rejected');return send({ok:true});}
      throw new UserError('Действие не найдено.',404);
    }catch(e){if(!res.headersSent)send({ok:false,error:e instanceof UserError?e.message:'Не удалось выполнить действие.'},e instanceof UserError?e.code:500);}
  });
  return {server,status,stop:()=>running?.controller.abort()};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const config=configuration();config.instance=process.argv.find(x=>x.startsWith('--instance='))?.split('=')[1];
  const app=createBriefDesk(config);app.server.listen(config.port,'127.0.0.1',()=>console.log(`Brief Desk ready on 127.0.0.1:${config.port}`));
  app.server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Brief Desk port is already in use.':'Brief Desk could not start.');process.exitCode=1;});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{app.stop();app.server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),2500).unref();});
}
