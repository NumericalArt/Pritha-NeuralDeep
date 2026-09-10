#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadPrithaRuntimeEnv } from './lib/env.mjs';
import { agentInstanceKey } from './agents-mother/identity.mjs';
import { portAvailable } from './lib/distribution-instance.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
loadPrithaRuntimeEnv({root});
if(!process.env.PRITHA_STATE_ROOT || !process.env.PRITHA_AGENT_PARENT) throw new Error('Prepare the NeuralDeep instance before installing examples.');
const state=path.resolve(process.env.PRITHA_STATE_ROOT), parent=path.resolve(process.env.PRITHA_AGENT_PARENT);
const project=path.join(parent,'brief-desk-nd'), seed=path.join(root,'examples','brief-desk-nd');
const receipt=path.join(state,'setup','brief-desk-seed.json');
if(fs.existsSync(project)) {
  if(!fs.existsSync(receipt)) throw new Error('Brief Desk folder already exists; inspect it before importing. No files changed.');
  console.log('Brief Desk already installed; existing code and state preserved.');
} else {
  fs.mkdirSync(parent,{recursive:true,mode:0o700});
  fs.cpSync(path.join(seed,'project'),project,{recursive:true});
  let port=3435;while(!(await portAvailable(port))){if(++port>3499)throw new Error('Set an available Brief Desk port before importing.');}
  const manifestFile=path.join(project,'operations','manifest.json');const manifest=JSON.parse(fs.readFileSync(manifestFile));
  manifest.local_upstream_url=`http://127.0.0.1:${port}`;manifest.health_url=`http://127.0.0.1:${port}/health`;
  fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
  fs.writeFileSync(path.join(project,'.env.local'),`BRIEF_DESK_ND_PORT=${port}\n`,{mode:0o600});
  fs.mkdirSync(path.join(project,'.data'),{mode:0o700});
  fs.writeFileSync(path.join(project,'.data','pritha-parent.json'),JSON.stringify({schema:'pritha-credential-reference-v1',service:process.env.PRITHA_NEURALDEEP_KEYCHAIN_SERVICE,instanceId:process.env.PRITHA_INSTANCE_ID},null,2),{mode:0o600});
  const memory=path.join(state,'agents');
  for(const kind of ['contracts','outcome-specs','profiles']){
    fs.mkdirSync(path.join(memory,kind),{recursive:true,mode:0o700});
    for(const name of fs.readdirSync(path.join(seed,'agent-memory',kind))){
      let text=fs.readFileSync(path.join(seed,'agent-memory',kind,name),'utf8').replaceAll('{{PROJECT_PATH}}',JSON.stringify(project)).replaceAll('{{INSTANCE_KEY}}',agentInstanceKey(state)).replaceAll('{{CONTRACT_PATH}}',JSON.stringify(path.join(memory,'contracts','brief-desk-nd.md')));
      fs.writeFileSync(path.join(memory,kind,name),text,{mode:0o600});
    }
  }
  for(const args of [['init','-b','main'],['add','.'],['-c','user.name=Pritha Local','-c','user.email=local@localhost','-c','core.hooksPath=/dev/null','commit','-m','Initialize bundled Brief Desk ND']]) {
    const git=spawnSync('git',args,{cwd:project,encoding:'utf8'});if(git.status!==0)throw new Error('Brief Desk local Git initialization failed.');
  }
  const p=spawnSync(process.execPath,['scripts/agents-mother.mjs','registry'],{cwd:root,stdio:'inherit',env:process.env});if(p.status!==0)throw new Error('Agent registry failed; inspect instance state before retrying.');
  fs.mkdirSync(path.dirname(receipt),{recursive:true,mode:0o700});fs.writeFileSync(receipt,JSON.stringify({version:'0.1.0',project,installedAt:new Date().toISOString()},null,2),{mode:0o600});
  console.log('Installed Brief Desk ND. It is stopped and ready for local Start.');
}
