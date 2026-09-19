import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {existsSync,lstatSync,mkdirSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';
const execute=promisify(execFile),ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class ExecutionWorkspaceError extends Error {
  constructor(code){super(code);this.code=code;this.status=409;}
}
function directory(value){
  const resolved=path.resolve(value);
  if(!existsSync(resolved)||lstatSync(resolved).isSymbolicLink()||!lstatSync(resolved).isDirectory())throw new ExecutionWorkspaceError('workspace_directory_unverified');
  return realpathSync(resolved);
}
function gitEnvironment(){
  const env={...process.env};
  for(const key of Object.keys(env))if(key.startsWith('GIT_'))delete env[key];
  return {...env,GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0'};
}
async function git(cwd,args){
  try{return (await execute('git',['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-c','submodule.recurse=false','-C',cwd,...args],{
    env:gitEnvironment(),timeout:30000,killSignal:'SIGKILL',maxBuffer:2*1024*1024,encoding:'utf8'})).stdout.trimEnd();}
  catch{throw new ExecutionWorkspaceError('workspace_git_operation_unconfirmed');}
}
async function gitIdentity(cwd){
  const [sourceRoot,common,gitDir]=await Promise.all([git(cwd,['rev-parse','--show-toplevel']),git(cwd,['rev-parse','--path-format=absolute','--git-common-dir']),git(cwd,['rev-parse','--absolute-git-dir'])]);
  return {sourceRoot:directory(sourceRoot),common:directory(common),gitDir:directory(gitDir)};
}
async function checkoutOptions(source){
  let names='';
  try{names=(await execute('git',['-c','core.fsmonitor=false','-C',source,'config','--name-only','--get-regexp','^filter\\..*\\.(smudge|process|required|clean)$'],{env:gitEnvironment(),timeout:5000,killSignal:'SIGKILL',maxBuffer:64*1024,encoding:'utf8'})).stdout;}
  catch(error){if(error.code!==1 || String(error.stderr || '').trim())throw new ExecutionWorkspaceError('workspace_checkout_filter_unverified');}
  const options=[];
  for(const key of names.split('\n').filter(Boolean)){
    if(!/^filter\.[a-zA-Z0-9_.-]+\.(smudge|process|required|clean)$/.test(key))throw new ExecutionWorkspaceError('workspace_checkout_filter_unverified');
    options.push('-c',`${key}=${key.endsWith('.required')?'false':''}`);
  }
  return options;
}

/** Durable allocation per logical chat/topic. A native session never silently moves cwd. */
export class NeuralDeepExecutionWorkspaces {
  constructor(coordination,{stateRoot}){
    this.store=coordination;this.db=coordination.db;this.stateRoot=directory(stateRoot);
    this.root=path.join(this.stateRoot,'execution-workspaces');
    if(existsSync(this.root)&&lstatSync(this.root).isSymbolicLink())throw new ExecutionWorkspaceError('workspace_storage_unverified');
    mkdirSync(this.root,{recursive:true,mode:0o700});
    if(directory(this.root)!==this.root)throw new ExecutionWorkspaceError('workspace_storage_unverified');
    coordination.transaction(()=>this.db.exec(`CREATE TABLE IF NOT EXISTS execution_workspaces(
      owner TEXT PRIMARY KEY,request_hash TEXT NOT NULL,record TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS execution_agent_targets(owner TEXT PRIMARY KEY,path TEXT UNIQUE NOT NULL,state TEXT NOT NULL);`));
  }
  get(owner){const row=this.db.prepare('SELECT record FROM execution_workspaces WHERE owner=?').get(owner);return row?JSON.parse(row.record):null;}
  save(owner,hash,record){this.store.transaction(()=>{
    const prior=this.db.prepare('SELECT request_hash FROM execution_workspaces WHERE owner=?').get(owner);
    if(prior&&prior.request_hash!==hash)throw new ExecutionWorkspaceError('workspace_binding_conflict');
    this.db.prepare('INSERT INTO execution_workspaces(owner,request_hash,record) VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET record=excluded.record')
      .run(owner,hash,JSON.stringify(record));
  });return record;}
  async verify(record){
    if(directory(record.cwd)!==record.cwd)throw new ExecutionWorkspaceError('workspace_identity_changed');
    if(record.mode==='worktree'){
      const identity=await gitIdentity(record.cwd);
      if(identity.common!==record.common||identity.gitDir!==record.gitDir||identity.sourceRoot!==record.cwd)throw new ExecutionWorkspaceError('workspace_identity_changed');
      const listed=await git(record.source,['worktree','list','--porcelain','-z']);
      if(!listed.split('\0').includes(`worktree ${record.cwd}`))throw new ExecutionWorkspaceError('workspace_registration_missing');
      if(record.expectedCommit && await git(record.cwd,['rev-parse','HEAD'])!==record.expectedCommit)throw new ExecutionWorkspaceError('workspace_execution_revision_mismatch');
    }
    return record;
  }
  async prepare({ownerId,sourcePath,mutating,existingCwd=null,nativeSession=false,scratch=false,expectedCommit=null,requireClean=false}){
    if(!ID.test(ownerId)||typeof mutating!=='boolean')throw new ExecutionWorkspaceError('workspace_request_invalid');
    if(expectedCommit!==null && !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(expectedCommit) || typeof requireClean!=='boolean')throw new ExecutionWorkspaceError('workspace_revision_policy_invalid');
    const source=directory(sourcePath);
    const assertSource=async()=>{
      if(expectedCommit && await git(source,['rev-parse','HEAD'])!==expectedCommit)throw new ExecutionWorkspaceError('workspace_source_revision_mismatch');
      if(requireClean && await git(source,[...await checkoutOptions(source),'status','--porcelain=v1','--untracked-files=normal']))throw new ExecutionWorkspaceError('workspace_source_dirty');
    };
    await assertSource();
    const verifyPinned=async(record)=>{
      if(expectedCommit && (record.mode!=='worktree' || record.baseCommit!==expectedCommit))throw new ExecutionWorkspaceError('workspace_release_migration_required');
      if(expectedCommit && await git(record.cwd,['rev-parse','HEAD'])!==expectedCommit)throw new ExecutionWorkspaceError('workspace_execution_revision_mismatch');
      return this.verify(record);
    };
    const prior=this.get(ownerId);
    if(prior?.state==='ready'){
      if(source!==prior.source)throw new ExecutionWorkspaceError('workspace_binding_conflict');
      if(existingCwd&&directory(existingCwd)!==prior.cwd)throw new ExecutionWorkspaceError('workspace_session_cwd_conflict');
      return verifyPinned(prior);
    }
    if(expectedCommit && (scratch || nativeSession || !mutating))throw new ExecutionWorkspaceError('workspace_release_requires_worktree');
    const hash=digest([ownerId,source,nativeSession?directory(existingCwd||source):null,...(expectedCommit || requireClean ? [expectedCommit,requireClean] : [])]);
    const control=digest(['workspace-prepare',this.stateRoot,ownerId]).slice(0,24),token=`workspace_${randomUUID()}`;
    if(!this.store.acquireSessionControl(control,token))throw new ExecutionWorkspaceError('workspace_preparing');
    try{
      let record=this.get(ownerId);
      if(record?.state==='ready')return verifyPinned(record);
      if(record&&record.requestHash!==hash)throw new ExecutionWorkspaceError('workspace_binding_conflict');
      if(!record){
        const base={version:1,ownerId,source,requestHash:hash,createdAt:new Date().toISOString(),retention:'session-bound',...(expectedCommit ? {expectedCommit} : {}),...(requireClean ? {requireClean:true} : {})};
        if(!nativeSession && scratch){
          const cwd=path.join(this.root,`scratch-${digest(ownerId).slice(0,32)}`);
          if(existsSync(cwd))throw new ExecutionWorkspaceError('workspace_allocation_unconfirmed');
          record={...base,mode:'scratch',cwd,state:'planned'};this.save(ownerId,hash,record);
          mkdirSync(cwd,{mode:0o700});return this.save(ownerId,hash,{...record,state:'ready'});
        }
        if(nativeSession||!mutating){
          record={...base,mode:nativeSession?'existing':'shared-read',cwd:directory(existingCwd||source),state:'ready'};
          return this.save(ownerId,hash,record);
        }
        let identity;
        try{identity=await gitIdentity(source);}catch{
          // A non-Git directory stays in place under an exclusive write claim.
          const notGit=await execute('git',['-C',source,'rev-parse','--is-inside-work-tree'],{env:gitEnvironment(),timeout:5000,killSignal:'SIGKILL',encoding:'utf8'}).then(()=>false,error=>error.code===128 && /not a git repository/i.test(String(error.stderr)));
          if(!notGit)throw new ExecutionWorkspaceError('workspace_git_identity_unverified');
          return this.save(ownerId,hash,{...base,mode:'shared-write',cwd:source,state:'ready'});
        }
        if(identity.sourceRoot!==source)throw new ExecutionWorkspaceError('workspace_source_root_required');
        const revision=await git(source,['rev-parse','HEAD']);
        if(!/^[a-f0-9]{40,64}$/.test(revision))throw new ExecutionWorkspaceError('workspace_source_revision_unverified');
        if(expectedCommit && revision!==expectedCommit)throw new ExecutionWorkspaceError('workspace_source_revision_mismatch');
        const files=(await git(source,['ls-tree','-rz','--name-only',revision])).split('\0').filter(Boolean);
        // Scaffold templates are public inputs, including .env.example.tmpl.
        // Keep the exception exact so backups and real environment files stay blocked.
        if(files.some(name=>/(^|\/)(\.env(?!\.(example|sample|template)(\.tmpl)?$)(\.|$)|\.private\/|\.memory-private\/|\.queue\/|\.logs\/|codex-home\/)/.test(name)))throw new ExecutionWorkspaceError('workspace_sensitive_tracked_files');
        record={...base,mode:'worktree',cwd:path.join(this.root,`workspace-${digest([ownerId,source]).slice(0,32)}`),
          common:identity.common,sourceGitDir:identity.gitDir,baseCommit:revision,sourceDirty:Boolean(await git(source,[...await checkoutOptions(source),'status','--porcelain=v1','--untracked-files=normal'])),state:'planned'};
        if(requireClean && record.sourceDirty)throw new ExecutionWorkspaceError('workspace_source_dirty');
        this.save(ownerId,hash,record);
      }
      if(record.mode==='scratch')throw new ExecutionWorkspaceError('workspace_allocation_unconfirmed');
      const gitControl=digest(['git-worktree-admin',record.common]).slice(0,24),gitOwner=`workspace_${randomUUID()}`;
      if(!this.store.acquireSessionControl(gitControl,gitOwner))throw new ExecutionWorkspaceError('workspace_git_admin_busy');
      try{
        if(!existsSync(record.cwd)){
          const options=await checkoutOptions(source);
          await git(source,[...options,'worktree','add','--detach',record.cwd,record.baseCommit]);
        }
        const identity=await gitIdentity(record.cwd);
        if(identity.common!==record.common||identity.sourceRoot!==record.cwd)throw new ExecutionWorkspaceError('workspace_identity_changed');
        if(await git(record.cwd,['rev-parse','HEAD'])!==record.baseCommit)throw new ExecutionWorkspaceError('workspace_allocation_unconfirmed');
        record={...record,gitDir:identity.gitDir,state:'ready',preparedAt:new Date().toISOString()};
        await assertSource();await verifyPinned(record);return this.save(ownerId,hash,record);
      }finally{this.store.releaseSessionControl(gitControl,gitOwner);}
    }finally{this.store.releaseSessionControl(control,token);}
  }

  allocateAgentTarget(ownerId,parentPath,name=null){
    if(!ID.test(ownerId) || (name!==null && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(name)))throw new ExecutionWorkspaceError('agent_target_name_invalid');
    const parent=directory(parentPath),target=path.join(parent,name || `agent-${digest(ownerId).slice(0,10)}`);
    const control=digest(['agent-target',target]).slice(0,24),token=`workspace_${randomUUID()}`;
    if(!this.store.acquireSessionControl(control,token))throw new ExecutionWorkspaceError('workspace_preparing');
    try{
      const prior=this.db.prepare('SELECT * FROM execution_agent_targets WHERE owner=?').get(ownerId);
      if(prior){
        if(prior.path!==target || prior.state!=='ready' || directory(target)!==target)throw new ExecutionWorkspaceError('agent_target_identity_unconfirmed');
        return target;
      }
      if(existsSync(target))throw new ExecutionWorkspaceError('agent_target_exists');
      this.store.transaction(()=>this.db.prepare('INSERT INTO execution_agent_targets(owner,path,state) VALUES(?,?,?)').run(ownerId,target,'planned'));
      mkdirSync(target,{mode:0o700});
      this.store.transaction(()=>this.db.prepare("UPDATE execution_agent_targets SET state='ready' WHERE owner=? AND path=? AND state='planned'").run(ownerId,target));
      return target;
    }finally{this.store.releaseSessionControl(control,token);}
  }

  /** Reuse a host-reserved ready sibling. Does not create folders or steal untracked children. */
  adoptReadyAgentTarget(parentPath,name){
    if(!name || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(name))throw new ExecutionWorkspaceError('agent_target_name_invalid');
    const parent=directory(parentPath),target=path.join(parent,name);
    const control=digest(['agent-target',target]).slice(0,24),token=`workspace_${randomUUID()}`;
    if(!this.store.acquireSessionControl(control,token))throw new ExecutionWorkspaceError('workspace_preparing');
    try{
      const row=this.db.prepare('SELECT * FROM execution_agent_targets WHERE path=?').get(target);
      if(!row || row.state!=='ready' || !existsSync(target) || directory(target)!==target)return null;
      return target;
    }finally{this.store.releaseSessionControl(control,token);}
  }
}
