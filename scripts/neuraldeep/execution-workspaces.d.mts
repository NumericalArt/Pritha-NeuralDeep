import type { NeuralDeepCoordinationStore } from './coordination-store.mjs';
export type ExecutionWorkspace = {version:1;ownerId:string;source:string;requestHash:string;createdAt:string;retention:'session-bound';mode:'worktree'|'existing'|'shared-read'|'shared-write'|'scratch';cwd:string;state:'planned'|'ready';common?:string;sourceGitDir?:string;gitDir?:string;baseCommit?:string;sourceDirty?:boolean;preparedAt?:string};
export class ExecutionWorkspaceError extends Error {code:string;status:number;constructor(code:string);}
export class NeuralDeepExecutionWorkspaces {
 constructor(coordination:NeuralDeepCoordinationStore,options:{stateRoot:string});
 get(owner:string):ExecutionWorkspace|null;
 verify(record:ExecutionWorkspace):Promise<ExecutionWorkspace>;
 prepare(input:{ownerId:string;sourcePath:string;mutating:boolean;existingCwd?:string|null;nativeSession?:boolean;scratch?:boolean}):Promise<ExecutionWorkspace>;
 allocateAgentTarget(ownerId:string,parentPath:string,name?:string|null):string;
}
