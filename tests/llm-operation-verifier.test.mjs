import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encodeProductApi, outcomeVerifierPresetFiles, productApiIssues, renderOutcomeVerifierPreset } from '../scripts/agents-mother/outcome-verifier-presets.mjs';

const api = {
  operation: { method: 'POST', path: '/api/analyses', inputField: 'notes' },
  list: { path: '/api/analyses', itemsField: 'analyses' },
  export: { path: '/api/analyses/:id/export' },
  sampleInput: 'Встреча 12.09: Анна готовит отчёт к пятнице, Иван обновляет сайт.',
  providerResponse: '{"tasks":[{"what":"Подготовить отчёт {{nonce}}","owner":"Анна","due":"пятница","priority":"high"}]}',
};

// A minimal product that follows the declared API; `faulty` saves even when the provider fails.
const product = faulty => `
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const file = path.join(process.env.PRITHA_DATA_DIR, 'analyses.json');
const load = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; } };
const save = items => { fs.writeFileSync(file + '.tmp', JSON.stringify(items)); fs.renameSync(file + '.tmp', file); };
const json = (res, status, value) => { res.writeHead(status, {'content-type': 'application/json'}); res.end(JSON.stringify(value)); };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') return json(res, 200, {status: 'ok'});
  if (url.pathname === '/') { res.writeHead(200, {'content-type': 'text/html'}); return res.end('<!doctype html><html><body>Action Items Desk</body></html>'); }
  if (url.pathname === '/api/analyses' && req.method === 'GET') return json(res, 200, {analyses: load()});
  const exportMatch = /^\\/api\\/analyses\\/([^/]+)\\/export$/.exec(url.pathname);
  if (exportMatch) { const item = load().find(x => x.id === exportMatch[1]); if (!item) return json(res, 404, {error: 'not found'});
    res.writeHead(200, {'content-type': 'text/markdown'}); return res.end(item.tasks.map(t => '- ' + t.what).join('\\n')); }
  if (url.pathname === '/api/analyses' && req.method === 'POST') {
    let raw = ''; for await (const c of req) raw += c; const {notes} = JSON.parse(raw);
    if (!process.env.PRITHA_LLM_BASE_URL) return json(res, 503, {error: 'NeuralDeep не настроен в Pritha'});
    let tasks;
    try {
      const r = await fetch(process.env.PRITHA_LLM_BASE_URL + '/chat/completions', {method: 'POST', headers: {'content-type': 'application/json', authorization: 'Bearer ' + process.env.PRITHA_LLM_TOKEN},
        body: JSON.stringify({model: process.env.PRITHA_LLM_MODEL, stream: false, max_tokens: 2000, messages: [{role: 'system', content: 'Extract tasks as JSON'}, {role: 'user', content: notes}]})});
      if (!r.ok) throw new Error('provider ' + r.status);
      tasks = JSON.parse((await r.json()).choices[0].message.content).tasks;
      if (!Array.isArray(tasks)) throw new Error('bad format');
    } catch (error) {
      if (${faulty}) { const items = load(); items.push({id: String(Date.now()), tasks: []}); save(items); }
      return json(res, 502, {error: 'Провайдер недоступен: ' + error.message});
    }
    const item = {id: String(Date.now()) + Math.random().toString(16).slice(2), notes, tasks}; const items = load(); items.push(item); save(items);
    return json(res, 201, item);
  }
  json(res, 404, {error: 'not found'});
}).listen(Number(process.env.PORT), '127.0.0.1');
`;

function runVerifier(t, faulty) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'llm-operation-product-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'scripts')); mkdirSync(path.join(root, 'tests/trials'), { recursive: true });
  writeFileSync(path.join(root, 'scripts/server.mjs'), product(faulty));
  const [file] = outcomeVerifierPresetFiles('llm-operation-v1');
  writeFileSync(path.join(root, file.path), file.content);
  return spawnSync(process.execPath, [file.path, 'llm-operation-v1', encodeProductApi(api)], { cwd: root, encoding: 'utf8', timeout: 120_000 });
}

test('the generic LLM verifier passes a product that follows its declared API', t => {
  assert.deepEqual(productApiIssues(api), []);
  const result = runVerifier(t, false);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /"verified":"llm-operation-v1"/);
});

test('the generic LLM verifier rejects a product that saves a result when the provider fails', t => {
  const result = runVerifier(t, true);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not save a fabricated result/);
});

test('the protected Trial embeds the declared API and rejects an invalid declaration', () => {
  const trial = renderOutcomeVerifierPreset('llm-operation-v1', ['deliverable:01-x'], { productApi: api });
  assert.match(trial, /POST \/api\/analyses accepts JSON \{notes: <user text>\}/);
  assert.match(trial, new RegExp(encodeProductApi(api)));
  assert.throws(() => renderOutcomeVerifierPreset('llm-operation-v1', ['deliverable:01-x'], { productApi: { ...api, providerResponse: 'no nonce' } }), /declared productApi/);
  assert.match(renderOutcomeVerifierPreset('llm-operation-v1', ['deliverable:01-x']), /DECLARE_PRODUCT_API/, 'an undeclared API stays a visible placeholder');
  assert.ok(productApiIssues({ ...api, list: { path: '/api/:id', itemsField: 'x' } }).length);
});
