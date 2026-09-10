import {createHash} from 'node:crypto';
import {ChatHistoryError} from './chat-history-store.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fields=['chatId','clientThreadId','providerId','nativeThreadId','identityStatus','profileIdentity','stateIdentityHash','modelId','effortId',
  'group','origin','lastStatus','pinned','archived','createdAt','updatedAt','continuationEnabled','voiceTopicId'];
const pick=(object,keys)=>Object.fromEntries(keys.filter(key=>object[key]!==undefined).map(key=>[key,object[key]]));
const clip=(value,max)=>String(value||'').slice(0,max);

/** Rebuildable, bounded list projection; originals and receipts never enter list/heartbeat reads. */
export class NeuralDeepChatSummaries {
  constructor(history){
    this.h=history;this.db=history.db;
    history.transaction(()=>{
      this.db.exec(`CREATE TABLE IF NOT EXISTS chat_summaries(id TEXT PRIMARY KEY,scope TEXT NOT NULL,chat_group TEXT NOT NULL,
        archived INTEGER NOT NULL,pinned INTEGER NOT NULL,updated TEXT NOT NULL,title TEXT NOT NULL,preview TEXT NOT NULL,record TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS chat_summaries_order ON chat_summaries(chat_group,pinned DESC,updated DESC,id DESC);
        CREATE INDEX IF NOT EXISTS chat_summaries_visibility ON chat_summaries(scope);
        CREATE INDEX IF NOT EXISTS task_links_chat_status ON task_links(chat,json_extract(value,'$.status'));
        CREATE INDEX IF NOT EXISTS history_summary_events ON source_events(kind,sequence,chat);`);
      if(history.meta('summary_projection_version')!=='1'){
        this.db.exec('DELETE FROM chat_summaries');
        for(const row of this.db.prepare('SELECT id FROM chats ORDER BY rowid').iterate())this.project(row.id);
        history.setMeta('summary_projection_version','1');history.setMeta('summary_projection_sequence',String(this.high()));
      }
    });
  }
  high(){return this.h.statement('SELECT max(sequence) AS high FROM source_events').get().high||0;}
  project(chat){
    const row=this.h.statement('SELECT meta,revision FROM chats WHERE id=?').get(chat);
    if(!row)return;
    const source=JSON.parse(row.meta),record={...pick(source,fields),revision:row.revision,title:clip(source.title,120),preview:clip(source.preview,500),
      turns:[],messageReceipts:{},taskLinks:[]};
    const recent=this.h.statement('SELECT id,value FROM task_links WHERE chat=? ORDER BY rowid DESC LIMIT 1').get(chat);
    const blocker=this.h.statement("SELECT id,value FROM task_links WHERE chat=? AND json_extract(value,'$.status') IN ('waiting_for_input','waiting_for_approval','resume_confirmation_required','waiting_for_operator') ORDER BY rowid DESC LIMIT 1").get(chat);
    record.taskLinks=[blocker,recent].filter((value,index,all)=>value&&all.findIndex(x=>x?.id===value.id)===index).map(row=>{
      const link=JSON.parse(row.value);return {...pick(link,['taskId','shortId','origin','mode','status','linkedAt']),label:clip(link.label,240),subjectScope:link.subjectScope?{
        ...pick(link.subjectScope,['kind','generation']),id:clip(link.subjectScope.id,160),label:clip(link.subjectScope.label,120)}:null};
    });
    const active=this.h.statement("SELECT meta FROM turns WHERE chat=? AND status IN ('in_progress','waiting_for_approval','waiting_for_input','waiting_for_provider') ORDER BY sequence LIMIT 1").get(chat)
      ||this.h.statement('SELECT meta FROM turns WHERE chat=? ORDER BY sequence DESC LIMIT 1').get(chat);
    if(active){
      const turn=JSON.parse(active.meta);record.execution={state:turn.status==='in_progress'?'running':turn.status,attemptId:turn.executionIntent?.attemptId||null,
        turnId:turn.turnId,taskId:turn.taskId||null,errorCode:turn.error?.code||null,startedAt:turn.startedAt||null,completedAt:turn.completedAt||null};
    }
    if(source.executionWorkspace)record.workspace={mode:source.executionWorkspace.mode,path:clip(source.workspacePath,2048),sourceDirty:Boolean(source.executionWorkspace.sourceDirty),
      baseCommit:source.executionWorkspace.baseCommit||null,applicationRequired:source.executionWorkspace.mode==='worktree'};
    const scope=this.h.aliasScope(source);
    this.h.statement(`INSERT INTO chat_summaries VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET scope=excluded.scope,chat_group=excluded.chat_group,
      archived=excluded.archived,pinned=excluded.pinned,updated=excluded.updated,title=excluded.title,preview=excluded.preview,record=excluded.record`)
      .run(chat,scope,source.group||'my_chats',source.archived?1:0,source.pinned?1:0,source.updatedAt||'',record.title.toLowerCase(),record.preview.toLowerCase(),JSON.stringify(record));
  }
  synchronize(){
    this.h.transaction(()=>{
      const after=Number(this.h.meta('summary_projection_sequence')||0),high=this.high();
      // Only changed identities are read; raw JSONL/content is never materialized.
      for(const row of this.h.statement("SELECT DISTINCT chat FROM source_events WHERE sequence>? AND sequence<=? AND kind IN ('chat','turn','task_link')").iterate(after,high))this.project(row.chat);
      this.h.setMeta('summary_projection_sequence',String(high));
    });
  }
  list({group='all',archived=false,search='',cursor=null,limit=30}={}){
    if(!['all','my_chats','voice_work','other_sessions'].includes(group)||typeof archived!=='boolean'||typeof search!=='string'||search.length>400)throw new ChatHistoryError('invalid_request','Invalid summary query.',400);
    this.synchronize();
    const normalized=search.trim().toLowerCase(),filter=digest([group,archived,normalized]);
    const position=cursor?this.h.cursor('summary',cursor,'threads'):null;
    if(position&&(position.filter!==filter||![0,1].includes(position.pin)||typeof position.updated!=='string'||typeof position.id!=='string'))throw new ChatHistoryError('invalid_cursor','Reload this chat list.',400);
    const clauses=['COALESCE(v.archived,s.archived)=?'],params=[archived?1:0];
    if(group!=='all'){clauses.push('s.chat_group=?');params.push(group);}
    if(normalized){clauses.push("(instr(s.title,?)>0 OR instr(s.preview,?)>0)");params.push(normalized,normalized);}
    if(position){clauses.push('(s.pinned<? OR (s.pinned=? AND (s.updated<? OR (s.updated=? AND s.id<?))))');params.push(position.pin,position.pin,position.updated,position.updated,position.id);}
    const count=Math.max(1,Math.min(Number(limit)||30,50));params.push(count+1);
    const rows=this.h.statement(`SELECT s.*,COALESCE(v.archived,s.archived) AS visible_archived FROM chat_summaries s LEFT JOIN chat_visibility v ON v.scope=s.scope
      WHERE ${clauses.join(' AND ')} ORDER BY s.pinned DESC,s.updated DESC,s.id DESC LIMIT ?`).all(...params);
    const data=rows.slice(0,count).map(row=>({...JSON.parse(row.record),archived:Boolean(row.visible_archived)})),last=rows[count-1];
    return {data,nextCursor:rows.length>count?this.h.sign('summary','threads',{filter,pin:last.pinned,updated:last.updated,id:last.id}):null};
  }
  changes(cursor=null){
    const high=this.high();
    let after=high,reset=!cursor;
    if(cursor){try{const value=this.h.cursor('summary',cursor,'changes');if(!Number.isSafeInteger(value.after)||value.after<0||value.after>high)throw new Error();after=value.after;}
      catch{reset=true;}}
    const rows=this.h.statement("SELECT sequence,chat FROM source_events WHERE sequence>? AND sequence<=? AND kind IN ('chat','turn','task_link','visibility') ORDER BY sequence LIMIT 129").all(after,high);
    const more=rows.length>128,selected=rows.slice(0,128),next=more?selected.at(-1).sequence:high;
    return {cursor:this.h.sign('summary','changes',{after:next}),revision:next,changed:[...new Set(selected.map(row=>row.chat))],reset,more};
  }
  counts(){
    this.synchronize();
    return Object.fromEntries(this.h.statement(`SELECT s.chat_group,
      sum(json_extract(s.record,'$.execution.state') IN ('queued','running','waiting_for_provider')) AS working,
      sum(json_extract(s.record,'$.execution.state') IN ('waiting_for_input','waiting_for_approval','failed')) AS attention
      FROM chat_summaries s LEFT JOIN chat_visibility v ON v.scope=s.scope WHERE COALESCE(v.archived,s.archived)=0 GROUP BY s.chat_group`).all()
      .map(row=>[row.chat_group,{working:row.working||0,attention:row.attention||0}]));
  }
}
