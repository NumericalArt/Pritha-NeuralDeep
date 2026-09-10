#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const git=spawnSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'});
function walk(dir=''){return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(d=>{const rel=path.join(dir,d.name);if(['.git','node_modules','.next','.private','.data'].includes(d.name))return [];return d.isDirectory()?walk(rel):[rel];});}
const files=git.status===0&&git.stdout?git.stdout.split('\0').filter(Boolean):walk();
const errors=[];
for(const file of files){
 const p=path.join(root,file);if(!fs.existsSync(p)){errors.push(`${file}: tracked file missing`);continue;}
 if(fs.lstatSync(p).isSymbolicLink()){errors.push(`${file}: symlink`);continue;}
 if(/(^|\/)(?:\.env(?:\..*)?|\.pritha-instance\.json)$/.test(file)&&!file.endsWith('.env.example')&&!file.endsWith('.env.example.tmpl'))errors.push(`${file}: local configuration`);
 if(/(^|\/)(?:\.data|\.private|\.logs|\.queue|\.snapshots|node_modules|codex-home)(\/|$)|voice-session-memory|\.(?:sqlite3?|db|backup|current-backup)$/.test(file))errors.push(`${file}: runtime artifact`);
 if(/^11_agents\/(?:contracts|profiles)\/.+\.md$/.test(file))errors.push(`${file}: historical live agent identity`);
 if(fs.statSync(p).size>95*1024*1024)errors.push(`${file}: oversized file`);
 if(/\.(?:md|json|mjs|ts|tsx|txt|ya?ml|toml)$/.test(file)){
  const text=fs.readFileSync(p,'utf8');
  if(/\/Users\/jkl(?:\/|\b)|https?:\/\/[^\s"<>`]*\.tail[0-9a-z]+\.ts\.net/.test(text))errors.push(`${file}: personal host path or URL`);
  if(!file.startsWith('examples/')&&!file.startsWith('tests/')&&!file.startsWith('08_templates/')&&!file.startsWith('scripts/')&&!file.startsWith('interfaces/')&&/^privacy:\s*local-private\s*$/m.test(text))errors.push(`${file}: private authored document`);
 }
}
for(const name of ['README.md','START_HERE.md','AGENTS.md','CLAUDE.md','LICENSE','distribution/manifest.json','examples/brief-desk-nd/project/server.mjs','examples/brief-desk-nd/project/demo/brief.json','.memory/schema.sql'])if(!files.includes(name))errors.push(`${name}: missing required source`);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'distribution/manifest.json'),'utf8'));
if(JSON.stringify(manifest.examples)!=='["brief-desk-nd"]')errors.push('Unexpected bundled agent');
console.log(JSON.stringify({ok:!errors.length,files:files.length,errors},null,2));if(errors.length)process.exitCode=1;
