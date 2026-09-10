import fs from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {root,UserError,jsonRequest,configuration} from './lib-runtime.mjs';

export function publicSettings(c){return {ok:true,keySource:c.keySource||'own',neuraldeepConfigured:!!c.key,parentLinked:!!c.parentLinked,ownKeyConfigured:!!c.ownKeyConfigured,model:c.model,telegramConfigured:!!c.token,chatId:c.chatId||'',telegramReady:!!c.token&&!!c.chatId};}
export function saveSettings(input,folder=root){
  const allowed=['keySource','model','neuraldeepKey','removeNeuraldeepKey','telegramToken','removeTelegramToken','chatId'];
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k)))throw new UserError('Некорректные настройки.');
  const update={};
  if(input.keySource!==undefined){if(!['pritha','own'].includes(input.keySource))throw new UserError('Выберите источник ключа.');update.BRIEF_DESK_ND_KEY_SOURCE=input.keySource;}
  if(input.model!==undefined){if(typeof input.model!=='string'||!/^[\w][\w./:-]{0,191}$/.test(input.model))throw new UserError('Некорректная модель.');update.BRIEF_DESK_ND_MODEL=input.model;}
  for(const [field,name,remove] of [['neuraldeepKey','NEURALDEEP_API_KEY','removeNeuraldeepKey'],['telegramToken','TELEGRAM_BOT_TOKEN','removeTelegramToken']]){
    const v=input[field];if(v!==undefined&&(typeof v!=='string'||v.length>8192||/[\r\n\0]/.test(v)))throw new UserError('Некорректный ключ.');
    if(input[remove]!==undefined && typeof input[remove]!=='boolean')throw new UserError('Некорректная команда удаления.');
    if(input[remove]===true)update[name]='';else if(v?.trim()){if(field==='telegramToken'&&!/^\d{5,}:[\w-]{20,}$/.test(v.trim()))throw new UserError('Проверьте формат токена Telegram.');update[name]=v.trim();}
  }
  if(input.chatId!==undefined){if(typeof input.chatId!=='string'||(input.chatId&&!/^(?:-?\d{1,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/.test(input.chatId)))throw new UserError('Введите числовой ID или @имя канала.');update.TELEGRAM_PUBLISH_CHAT_ID=input.chatId;}
  for(const k of Object.keys(update))if(process.env[k]!==undefined)throw new UserError('Эта настройка задана окружением процесса. Измените её там и перезапустите сервис.',409);
  const file=path.join(folder,'.env.local');
  if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw new UserError('Файл настроек не должен быть ссылкой.');
  const prior=fs.existsSync(file)?parseEnv(fs.readFileSync(file,'utf8')):{};
  const next={...prior,...update};
  const temporary=file+'.settings-tmp';fs.writeFileSync(temporary,Object.entries(next).map(([k,v])=>`${k}=${JSON.stringify(String(v))}`).join('\n')+'\n',{mode:0o600});fs.chmodSync(temporary,0o600);fs.renameSync(temporary,file);
  return publicSettings(configuration(process.env,true,folder));
}
export async function telegramCheck(c){
  if(!c.token)throw new UserError('Сначала сохраните токен Telegram.');
  const call=async(method,body)=>{const result=await jsonRequest(`https://api.telegram.org/bot${c.token}/${method}`,body,{},AbortSignal.timeout(12000));if(!result.ok)throw new UserError('Telegram не подтвердил доступ. Проверьте токен, назначение и права.',502);return result.result;};
  const bot=await call('getMe');
  if(!c.chatId)return {ok:true,bot:bot.username,destinationReady:false};
  const chat=await call('getChat',{chat_id:c.chatId});
  const member=await call('getChatMember',{chat_id:c.chatId,user_id:bot.id});
  const denied=['left','kicked'].includes(member.status)||(chat.type==='channel'&&member.status!=='creator'&&!(member.status==='administrator'&&member.can_post_messages))||(member.status==='restricted'&&!member.can_send_messages);
  if(denied)throw new UserError('У бота нет права отправлять сообщения в это назначение.',403);
  return {ok:true,bot:bot.username,destinationReady:true,destination:chat.title||chat.username||String(chat.id)};
}
export async function neuraldeepCheck(c){
  if(!c.key)throw new UserError('Подключите NeuralDeep в Pritha или сохраните собственный ключ.');
  await jsonRequest('https://api.neuraldeep.ru/v1/models',null,{Authorization:`Bearer ${c.key}`},AbortSignal.timeout(12000));
  return {ok:true,configured:true};
}
