import { realpathSync, lstatSync } from "node:fs";
import path from "node:path";

export function canonicalResourcePath(value) {
  const requested=path.resolve(String(value || ""));
  const canonical=realpathSync(requested);
  if(lstatSync(requested).isSymbolicLink())throw new Error("execution_resource_path_unverified");
  return process.platform==="darwin"?canonical.toLowerCase():canonical;
}

export function executionResourceClaims({cwd,sandbox,additionalWritableDirs=[]}) {
  if(!path.isAbsolute(String(cwd || "")) || !["read-only","workspace-write","danger-full-access"].includes(sandbox))throw new Error("execution_resources_invalid");
  const claims=[{kind:"host",key:"execution-effects",mode:sandbox==="danger-full-access"?"write":"read"},
    {kind:"path",key:canonicalResourcePath(cwd),mode:sandbox==="read-only"?"read":"write"}];
  if(additionalWritableDirs.length>16)throw new Error("execution_resources_invalid");
  if(sandbox!=="read-only")for(const directory of additionalWritableDirs)claims.push({kind:"path",key:canonicalResourcePath(directory),mode:"write"});
  return normalizeResourceClaims(claims);
}

export function normalizeResourceClaims(input=[]) {
  if(!Array.isArray(input)||input.length>32)throw new Error("execution_resources_invalid");
  const unique=new Map();
  for(const row of input){
    if(!row || !["path","host","port","database","git-ref","mcp"].includes(row.kind)||!["read","write"].includes(row.mode)
      ||typeof row.key!=="string"||!row.key||row.key.length>2048||/[\u0000-\u001f]/.test(row.key))throw new Error("execution_resources_invalid");
    if(row.kind==="path"&&!path.isAbsolute(row.key))throw new Error("execution_resources_invalid");
    const key=JSON.stringify([row.kind,row.key]),prior=unique.get(key);
    unique.set(key,{kind:row.kind,key:row.key,mode:prior?.mode==="write"?"write":row.mode});
  }
  return [...unique.values()].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
