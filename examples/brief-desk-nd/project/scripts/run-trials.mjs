// Trials use temporary state and injected providers; never production data or Telegram.
import {spawnSync} from 'node:child_process';
import {root} from '../lib-runtime.mjs';
const result=spawnSync(process.execPath,['--test','tests/brief-desk.test.mjs'],{cwd:root,stdio:'inherit'});process.exitCode=result.status||0;
