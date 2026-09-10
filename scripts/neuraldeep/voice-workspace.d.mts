import type {NeuralDeepExecutionWorkspaces,ExecutionWorkspace} from './execution-workspaces.mjs';
export function prepareVoiceWorkspace(input:{allocator:NeuralDeepExecutionWorkspaces;ownerId:string;root:string;task:Record<string,unknown>;
 binding:{nativeThreadId?:string|null;workspacePath?:string;executionWorkspace?:ExecutionWorkspace};projects:Array<{name:string;directory:string;aliases:string[]}>;
 agentParent:string;agentMemoryRoot:string;permissions:{sandbox:'read-only'|'workspace-write'|'danger-full-access';network:boolean};
 nativeProof?:{available:boolean;code:string;workspacePath?:string}|null}):Promise<{workspace:ExecutionWorkspace;sandbox:'read-only'|'workspace-write'|'danger-full-access';sourceReadOnly:boolean;additionalWritableDirs:string[];agentTarget:string|null;executionCodeRoot:string}>;
