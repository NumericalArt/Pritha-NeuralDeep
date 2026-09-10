import {mkdirSync,realpathSync} from 'node:fs';
import {ExecutionWorkspaceError} from './execution-workspaces.mjs';
import {canonicalResourcePath} from './execution-resources.mjs';

const alias=value=>String(value||'').toLowerCase().replace(/[^\p{L}0-9]+/gu,'');
/** Resolve only authored subject identity. Mentioning another project never grants it writes. */
export async function prepareVoiceWorkspace({allocator,ownerId,root,task,binding,projects,agentParent,agentMemoryRoot,permissions,nativeProof}){
  const creating=task.task_type==='agent_creation',agent=task.subject_kind==='agent';
  let source=root;
  if(agent&&!creating){
    const id=alias(task.subject_id);
    const matches=projects.filter(project=>id&&[project.name,...project.aliases].some(name=>alias(name)===id));
    if(matches.length!==1)throw new ExecutionWorkspaceError('voice_agent_subject_unverified');
    source=matches[0].directory;
  }
  if(binding.executionWorkspace&&canonicalResourcePath(source)!==canonicalResourcePath(binding.executionWorkspace.source))throw new ExecutionWorkspaceError('workspace_binding_conflict');
  if(binding.nativeThreadId&&!nativeProof?.available)throw new ExecutionWorkspaceError(nativeProof?.code||'native_workspace_unverified');
  const scratch=permissions.sandbox==='read-only'&&permissions.network;
  const workspace=await allocator.prepare({ownerId,sourcePath:source,mutating:permissions.sandbox!=='read-only',scratch,
    nativeSession:Boolean(binding.nativeThreadId),existingCwd:binding.workspacePath||nativeProof?.workspacePath||null});
  // A read-only native session cannot acquire a different cwd to enable network.
  if(scratch&&workspace.mode!=='scratch'&&binding.nativeThreadId)throw new ExecutionWorkspaceError('native_network_scratch_unavailable');
  const sandbox=scratch?'workspace-write':permissions.sandbox;
  const additionalWritableDirs=[];
  let agentTarget=null;
  if(sandbox!=='read-only'&&!scratch&&(creating||agent)){
    if(creating){
      const name=agent&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(String(task.subject_id||''))?String(task.subject_id):null;
      agentTarget=allocator.allocateAgentTarget(ownerId,agentParent,name);additionalWritableDirs.push(agentTarget);
    }
    mkdirSync(agentMemoryRoot,{recursive:true,mode:0o700});canonicalResourcePath(agentMemoryRoot);additionalWritableDirs.push(realpathSync(agentMemoryRoot));
  }
  const saved=task.execution_writable_dirs;
  if(saved!==undefined&&(!Array.isArray(saved)||JSON.stringify(saved)!==JSON.stringify(additionalWritableDirs)))throw new ExecutionWorkspaceError('voice_writable_permissions_conflict');
  return {workspace,sandbox,sourceReadOnly:scratch,additionalWritableDirs,agentTarget,
    executionCodeRoot:workspace.mode==='worktree'&&realpathSync(source)===realpathSync(root)?workspace.cwd:root};
}
