import { spawnSync, spawn } from 'node:child_process';
export function readProviderCredential(service = 'pritha-neuraldeep', environment = process.env) {
  const explicit = environment.PRITHA_NEURALDEEP_API_KEY || environment.NEURALDEEP_API_KEY;
  if (explicit) return explicit.trim();
  if (process.platform !== 'darwin') return '';
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(service)) return '';
  const result = spawnSync('/usr/bin/security', ['find-generic-password','-s',service,'-w'], {encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:5000});
  return result.status === 0 ? String(result.stdout || '').trim() : '';
}
export function providerCredentialStatus(service = 'pritha-neuraldeep') {
  const configured = Boolean(readProviderCredential(service));
  const source = process.env.PRITHA_NEURALDEEP_API_KEY || process.env.NEURALDEEP_API_KEY ? 'environment' : process.platform === 'darwin' ? 'macos_keychain' : 'environment';
  return { configured, status: configured ? 'configured':'missing', source, storageTarget: source === 'macos_keychain' ? `Keychain service ${service}` : 'PRITHA_NEURALDEEP_API_KEY', maskedValue: configured ? '••••••••':'', browserExposure:'status_only', purpose:'NeuralDeep tasks, Voice and linked Brief Desk' };
}
export async function storeProviderCredential(value, {service='pritha-neuraldeep',account=process.env.USER || 'pritha'} = {}) {
  const key=String(value || '').trim();
  if(!key || key.length>8192 || /[\r\n\0]/.test(key))throw new Error('invalid_neuraldeep_key');
  if(!/^[A-Za-z0-9._:-]{1,128}$/.test(service))throw new Error('invalid_credential_service');
  if(process.platform!=='darwin')throw new Error('Set PRITHA_NEURALDEEP_API_KEY in your server environment, then restart Pritha.');
  const child=spawn('/usr/bin/security',['add-generic-password','-U','-a',account,'-s',service,'-w'],{stdio:['pipe','ignore','pipe']});
  let stderr='';child.stderr.setEncoding('utf8');child.stderr.on('data',c=>stderr=(stderr+c).slice(-2000));
  child.stdin.on('error',()=>{});child.stdin.end(`${key}\n${key}\n`);
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  if(code!==0)throw new Error(/interaction is not allowed/i.test(stderr)?'keychain_locked':'keychain_write_failed');
  return providerCredentialStatus(service);
}
