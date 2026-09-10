import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawnSync } from 'node:child_process';

export function instanceConfig(root, env = process.env) {
  const file = path.join(root, '.pritha-instance.json');
  const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const id = env.PRITHA_INSTANCE_ID || saved?.id || `nd-${crypto.randomUUID().slice(0,8)}`;
  const stateRoot = env.PRITHA_STATE_ROOT || saved?.stateRoot || path.join(path.dirname(root), `${path.basename(root)}-state`, id);
  return { schema: 'pritha-instance-v1', id, stateRoot: path.resolve(stateRoot), agentParent: path.resolve(env.PRITHA_AGENT_PARENT || saved?.agentParent || path.join(path.dirname(root), `${path.basename(root)}-agents`, id)), port: Number(env.PRITHA_CONTROL_CENTER_PORT || saved?.port || 3520), keychainService: env.PRITHA_NEURALDEEP_KEYCHAIN_SERVICE || saved?.keychainService || `pritha-neuraldeep:${id}` };
}
export function applyInstanceEnvironment(root, config, env = process.env) {
  Object.assign(env, { TECHSCOPE_ROOT: root, PRITHA_INSTANCE_ID: config.id, PRITHA_STATE_ROOT: config.stateRoot, PRITHA_AGENT_PARENT: config.agentParent, PRITHA_CONTROL_CENTER_PORT: String(config.port), PRITHA_NEURALDEEP_KEYCHAIN_SERVICE: config.keychainService, PRITHA_NEURALDEEP_CODEX_HOME: path.join(config.stateRoot, 'codex-home') });
  return env;
}
export function portAvailable(port) {
  return new Promise(resolve => { const s = net.createServer(); s.once('error',()=>resolve(false)); s.listen(port,'127.0.0.1',()=>s.close(()=>resolve(true))); });
}
export async function prepareDistributionInstance(root) {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Pritha NeuralDeep requires Node.js 24 or newer.');
  for (const command of ['git','python3','sqlite3', process.env.PRITHA_CODEX_BIN || process.env.CODEX_BIN || 'codex']) {
    const check = spawnSync(command, [command === 'sqlite3' ? '-version' : '--version'], {stdio:'ignore',timeout:10000});
    if (check.status !== 0) throw new Error(`Missing prerequisite: ${command}. Install it and run bootstrap again.`);
  }
  const c = instanceConfig(root);
  const pointer = path.join(root,'.pritha-instance.json');
  if (!fs.existsSync(pointer) && !process.env.PRITHA_CONTROL_CENTER_PORT) {
    while (!(await portAvailable(c.port))) { if (++c.port > 3599) throw new Error('No free Control Center port. Set PRITHA_CONTROL_CENTER_PORT.'); }
  }
  for (const d of [c.stateRoot,c.agentParent,path.join(c.stateRoot,'config')]) fs.mkdirSync(d,{recursive:true,mode:0o700});
  fs.writeFileSync(pointer,JSON.stringify(c,null,2)+'\n',{mode:0o600});
  applyInstanceEnvironment(root,c);
  // Only a Git directory at this root belongs to this ZIP. Never reuse a parent checkout.
  if (!fs.existsSync(path.join(root,'.git'))) {
    for (const args of [['init','-b','main'],['add','.'],['-c','user.name=Pritha Local','-c','user.email=local@localhost','-c','core.hooksPath=/dev/null','commit','-m','Initialize downloaded Pritha NeuralDeep']]) {
      const p=spawnSync('git',args,{cwd:root,encoding:'utf8'});if(p.status!==0)throw new Error(`Local Git initialization failed: ${p.stderr}`);
    }
  }
  return c;
}
