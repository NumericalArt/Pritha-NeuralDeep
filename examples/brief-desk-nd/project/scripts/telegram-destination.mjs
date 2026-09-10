import {configuration,jsonRequest} from '../lib-runtime.mjs';
const {token}=configuration();
if(!token)throw new Error('Save the Telegram token in local Settings first.');
try {
 const r=await jsonRequest(`https://api.telegram.org/bot${token}/getUpdates`,{timeout:0,limit:20});
 if(!r.ok)throw new Error('Telegram did not return updates.');
 const chats=new Map();for(const u of r.result||[]){const c=(u.message||u.channel_post||u.my_chat_member)?.chat;if(c)chats.set(String(c.id),{id:String(c.id),type:c.type,title:c.title||c.username||'(private chat)'});}
 console.log(JSON.stringify([...chats.values()],null,2));
 if(!chats.size)console.log('No pending chat updates. Add the bot and send a new message/post, then retry.');
} catch { console.error('Cannot read updates. Check the token or an existing webhook integration.');process.exitCode=1; }
