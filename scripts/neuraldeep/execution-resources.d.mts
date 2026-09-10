export type ExecutionResourceClaim = {kind:"path"|"host"|"port"|"database"|"git-ref"|"mcp";key:string;mode:"read"|"write"};
export function canonicalResourcePath(value:string):string;
export function executionResourceClaims(input:{cwd:string;sandbox:string;additionalWritableDirs?:string[]}):ExecutionResourceClaim[];
export function normalizeResourceClaims(input?:unknown):ExecutionResourceClaim[];
