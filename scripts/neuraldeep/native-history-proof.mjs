import { createHash } from 'node:crypto';
import { constants, existsSync, lstatSync, openSync, closeSync, fstatSync, readSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { neuralDeepRuntimeIdentity } from './runtime-identity.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
function containedRegular(file, root) {
  const info = lstatSync(file), real = realpathSync(file);
  if (!info.isFile() || info.isSymbolicLink() || !real.startsWith(`${realpathSync(root)}${path.sep}`)) throw new Error('native_source_unsafe');
  return { real, info };
}
// No CLI execution, credentials, transcript export or writes to the native store.
export function inspectNativeSession(binding, { stateRoot, codeRoot, env = process.env }) {
  const identity = neuralDeepRuntimeIdentity(stateRoot, env);
  const unavailable = code => ({ available: false, code, restoreAvailable: false });
  if (binding.providerId !== 'neuraldeep_cli' || !binding.nativeThreadId || !/^[A-Za-z0-9._:-]{1,160}$/.test(binding.nativeThreadId)) return unavailable('native_identity_unverified');
  if (!binding.stateIdentityHash || binding.stateIdentityHash !== identity.stateIdentityHash || (binding.profileIdentity && binding.profileIdentity !== identity.profileIdentity)) return unavailable('native_storage_mismatch');
  try {
    const home = identity.home;
    if (!existsSync(home)) return unavailable('native_storage_missing');
    const indexes = readdirSync(home).filter(name => /^state_\d+\.sqlite$/.test(name)).sort((a, b) => Number(b.match(/\d+/)[0]) - Number(a.match(/\d+/)[0]));
    if (!indexes.length) return unavailable('native_index_missing');
    const index = containedRegular(path.join(home, indexes[0]), home);
    let row, db;
    try {
      db = new DatabaseSync(index.real, { readOnly: true });
      db.exec('PRAGMA busy_timeout=1500; PRAGMA query_only=ON;');
      row = db.prepare('SELECT id,rollout_path,model_provider,cwd FROM threads WHERE id=?').get(binding.nativeThreadId);
    } finally { db?.close(); }
    if (!row) return unavailable('native_thread_missing');
    if (row.model_provider !== 'neuraldeep') return unavailable('native_provider_mismatch');
    const expectedCwd = binding.workspacePath || codeRoot;
    if (!expectedCwd || realpathSync(row.cwd) !== realpathSync(expectedCwd)) return unavailable('native_workspace_mismatch');
    const source = containedRegular(row.rollout_path, home);
    const relative = path.relative(realpathSync(home), source.real).split(path.sep)[0];
    if (!['sessions', 'archived_sessions'].includes(relative)) return unavailable('native_source_unsafe');
    const fd = openSync(source.real, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
    let header;
    try {
      const opened = fstatSync(fd);
      if (opened.dev !== source.info.dev || opened.ino !== source.info.ino) return unavailable('native_source_changed');
      const chunk = Buffer.alloc(1024 * 1024), bytes = readSync(fd, chunk, 0, chunk.length, 0), newline = chunk.subarray(0, bytes).indexOf(10);
      if (newline < 0) return unavailable('native_format_unsupported');
      header = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(chunk.subarray(0, newline)));
    } finally { closeSync(fd); }
    if (header.type !== 'session_meta' || header.payload?.id !== row.id || header.payload?.model_provider !== 'neuraldeep') return unavailable('native_format_unsupported');
    if (realpathSync(header.payload.cwd) !== realpathSync(expectedCwd)) return unavailable('native_workspace_mismatch');
    return { available: true, code: 'native_source_verified', restoreAvailable: binding.identityStatus !== 'restored' || !binding.profileIdentity || !binding.workspacePath,
      proofHash: digest(JSON.stringify([identity.profileIdentity, row.id, source.info.dev, source.info.ino, header.payload])),
      profileIdentity: identity.profileIdentity, stateIdentityHash: identity.stateIdentityHash, workspacePath: expectedCwd };
  } catch (error) {
    return unavailable(error?.code === 'ENOENT' ? 'native_source_missing' : 'native_source_unavailable');
  }
}
