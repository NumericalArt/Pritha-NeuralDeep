import {lstatSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

/** Read-only status. Index maintenance must not take down the operator interface. */
export function readNeuralDeepMemorySummary(file){
  let db;
  try{
    const stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('memory_source_unverified');
    db=new DatabaseSync(file,{readOnly:true});db.exec('PRAGMA busy_timeout=200;PRAGMA query_only=ON;');
    const stats=db.prepare("SELECT 'documents' AS name,COUNT(*) AS count FROM documents UNION ALL SELECT 'chunks',COUNT(*) FROM chunks UNION ALL SELECT 'entities',COUNT(*) FROM entities UNION ALL SELECT 'relations',COUNT(*) FROM relations UNION ALL SELECT 'embeddings',COUNT(*) FROM embeddings").all();
    return {available:true,state:'ready',stats,error:null};
  }catch(error){const state=error.code==='ENOENT'?'missing':/locked|busy/i.test(error.message)?'busy':'unavailable';
    return {available:false,state,stats:[],error:`memory_${state}`};
  }finally{db?.close();}
}
