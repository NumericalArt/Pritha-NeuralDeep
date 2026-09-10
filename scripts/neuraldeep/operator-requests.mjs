import {createHash,randomUUID} from 'node:crypto';
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const HASH=/^[a-f0-9]{24,64}$/;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class OperatorRequestError extends Error {
  constructor(code){super(code);this.code=code;this.statusCode=409;}
}
function decode(row){return row?{requestId:row.id,taskId:row.task,topicId:row.topic,scope:row.scope,generation:row.generation,
  ownerGeneration:row.owner_generation,kind:row.kind,context:JSON.parse(row.context),status:row.status,revision:row.revision,
  intentId:row.intent_id,answer:row.answer?JSON.parse(row.answer):null,result:row.result?JSON.parse(row.result):null}:null;}

/** Host questions share the admission database. They do not implement native CLI input or count usage. */
export class NeuralDeepOperatorRequests {
  constructor(coordination){
    this.store=coordination;this.db=coordination.db;
    coordination.transaction(()=>this.db.exec(`CREATE TABLE IF NOT EXISTS operator_requests(
      id TEXT PRIMARY KEY, task TEXT NOT NULL,topic TEXT NOT NULL,scope TEXT NOT NULL,generation INTEGER NOT NULL,
      owner_generation INTEGER NOT NULL,kind TEXT NOT NULL,context_hash TEXT NOT NULL,context TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',revision INTEGER NOT NULL DEFAULT 1,intent_id TEXT UNIQUE,
      answer_hash TEXT,answer TEXT,result TEXT,worker_pid INTEGER,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS operator_requests_task ON operator_requests(task,created_at);
      CREATE INDEX IF NOT EXISTS operator_requests_status ON operator_requests(status,created_at);`));
  }
  get(id){return decode(this.db.prepare('SELECT * FROM operator_requests WHERE id=?').get(id));}
  latest(taskId){return decode(this.db.prepare('SELECT * FROM operator_requests WHERE task=? ORDER BY rowid DESC LIMIT 1').get(taskId));}
  register(input){
    if(!ID.test(input.requestId)||!ID.test(input.taskId)||!ID.test(input.topicId)||!HASH.test(input.scope)
      ||!Number.isSafeInteger(input.generation)||input.generation<1||!Number.isSafeInteger(input.ownerGeneration)||input.ownerGeneration<0
      ||!['answer','approval','recovery','handoff'].includes(input.kind)||!input.context||typeof input.context!=='object')throw new OperatorRequestError('operator_request_invalid');
    const context=JSON.stringify(input.context);if(Buffer.byteLength(context)>64*1024)throw new OperatorRequestError('operator_request_too_large');
    const hash=digest([input.taskId,input.topicId,input.scope,input.generation,input.ownerGeneration,input.kind,input.context]);
    return this.store.transaction(()=>{
      const previous=this.db.prepare('SELECT * FROM operator_requests WHERE id=?').get(input.requestId);
      if(previous){if(previous.context_hash!==hash)throw new OperatorRequestError('operator_request_identity_conflict');return decode(previous);}
      const now=new Date().toISOString();
      this.db.prepare('INSERT INTO operator_requests(id,task,topic,scope,generation,owner_generation,kind,context_hash,context,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(input.requestId,input.taskId,input.topicId,input.scope,input.generation,input.ownerGeneration,input.kind,hash,context,now,now);
      return this.get(input.requestId);
    });
  }
  accept({requestId,taskId,topicId,generation,expectedRevision,answer}){
    if(!ID.test(requestId)||!ID.test(taskId)||!ID.test(topicId)||!Number.isSafeInteger(generation)||!Number.isSafeInteger(expectedRevision)
      ||!answer||typeof answer!=='object')throw new OperatorRequestError('operator_request_invalid');
    const encoded=JSON.stringify(answer);if(Buffer.byteLength(encoded)>64*1024)throw new OperatorRequestError('operator_answer_too_large');
    const hash=digest(answer);
    return this.store.transaction(()=>{
      const row=this.db.prepare('SELECT * FROM operator_requests WHERE id=?').get(requestId);
      if(!row||row.task!==taskId||row.topic!==topicId||row.generation!==generation)throw new OperatorRequestError('operator_request_identity_conflict');
      if(row.answer_hash){
        if(row.answer_hash!==hash)throw new OperatorRequestError('operator_answer_conflict');
        return {...decode(row),dispatch:false,duplicate:true};
      }
      if(row.status!=='pending'||row.revision!==expectedRevision)throw new OperatorRequestError('operator_request_revision_conflict');
      if(row.owner_generation>0){
        const owner=this.db.prepare('SELECT * FROM logical_owners WHERE scope=?').get(row.scope);
        if(!owner?.held||owner.owner!==taskId||owner.generation!==row.owner_generation)throw new OperatorRequestError('operator_request_owner_changed');
      }
      const intentId=`operator_${randomUUID()}`;
      this.db.prepare("UPDATE operator_requests SET status='accepted',revision=revision+1,intent_id=?,answer_hash=?,answer=?,worker_pid=?,updated_at=? WHERE id=?")
        .run(intentId,hash,encoded,process.pid,new Date().toISOString(),requestId);
      return {...this.get(requestId),dispatch:true,duplicate:false};
    });
  }
  finish(requestId,intentId,result){
    const encoded=JSON.stringify(result);if(Buffer.byteLength(encoded)>64*1024)throw new OperatorRequestError('operator_result_too_large');
    return this.store.transaction(()=>{
      const row=this.db.prepare('SELECT * FROM operator_requests WHERE id=?').get(requestId);
      if(!row||row.intent_id!==intentId||!['accepted','completed','recovery_required'].includes(row.status))throw new OperatorRequestError('operator_intent_conflict');
      if(row.status!=='accepted')return decode(row);
      this.db.prepare("UPDATE operator_requests SET status=?,result=?,updated_at=? WHERE id=? AND intent_id=?")
        .run(result.ok===false?'recovery_required':'completed',encoded,new Date().toISOString(),requestId,intentId);
      return this.get(requestId);
    });
  }
}
