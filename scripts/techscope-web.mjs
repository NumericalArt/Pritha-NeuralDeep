#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import { resolvePrithaStatePath, resolveTechscopeRoot } from "./lib/paths.mjs";

const ROOT = resolveTechscopeRoot();
const DB_PATH = resolvePrithaStatePath("memory", "techscope.sqlite");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";

function sqlString(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqliteJson(sql) {
  const out = execFileSync("sqlite3", ["-json", DB_PATH, sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  return out ? JSON.parse(out) : [];
}

function json(res, value, status = 200) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(value, null, 2));
}

function html(res, value) {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(value);
}

function text(res, value, status = 200) {
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(value);
}

function notFound(res) {
  json(res, { error: "not_found" }, 404);
}

function stats() {
  return sqliteJson(`
SELECT 'documents' AS name, COUNT(*) AS count FROM documents
UNION ALL SELECT 'chunks', COUNT(*) FROM chunks
UNION ALL SELECT 'entities', COUNT(*) FROM entities
UNION ALL SELECT 'relations', COUNT(*) FROM relations
UNION ALL SELECT 'embeddings', COUNT(*) FROM embeddings;
`);
}

function openItems() {
  return sqliteJson(`
SELECT id, type, status, path, title
FROM documents
WHERE status IN ('new', 'draft', 'proposed')
  AND type != 'template'
ORDER BY type, path;
`);
}

function documents(params) {
  const type = params.get("type");
  const status = params.get("status");
  const where = [];
  if (type) where.push(`type = ${sqlString(type)}`);
  if (status) where.push(`status = ${sqlString(status)}`);
  return sqliteJson(`
SELECT id, type, status, path, title, updated_at
FROM documents
${where.length ? `WHERE ${where.join(" AND ")}` : ""}
ORDER BY type, path
LIMIT 200;
`);
}

function ftsSearch(q) {
  if (!q) return [];
  return sqliteJson(`
SELECT d.id, d.type, d.status, d.path, d.title, c.heading,
       snippet(chunks_fts, 0, '[', ']', ' ... ', 18) AS snippet
FROM chunks_fts
JOIN chunks c ON c.id = chunks_fts.chunk_id
JOIN documents d ON d.id = chunks_fts.document_id
WHERE chunks_fts MATCH ${sqlString(q)}
ORDER BY rank
LIMIT 30;
`);
}

function semanticSearch(q) {
  if (!q) return "";
  const result = spawnSync("python3", ["scripts/semantic-search.py", q, "--limit", "8"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    return result.stderr || result.stdout || "semantic search failed";
  }
  return result.stdout;
}

function readDocument(id) {
  const rows = sqliteJson(`
SELECT id, path, type, status, title
FROM documents
WHERE id = ${sqlString(id)}
LIMIT 1;
`);
  if (!rows.length) return null;
  const doc = rows[0];
  const fullPath = path.join(ROOT, doc.path);
  return {
    ...doc,
    markdown: readFileSync(fullPath, "utf8"),
    relations: sqliteJson(`
SELECT relation_type, target_type, target_id
FROM relations
WHERE source_id = ${sqlString(id)}
ORDER BY relation_type, target_type, target_id;
`),
  };
}

const PAGE = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Techscope Web</title>
  <style>
    :root { color-scheme: light; --ink:#172126; --muted:#617078; --line:#d9e0e3; --bg:#f7f8f8; --panel:#ffffff; --accent:#0b6f5c; }
    * { box-sizing: border-box; }
    body { margin:0; font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--ink); background:var(--bg); }
    header { padding:18px 22px; border-bottom:1px solid var(--line); background:var(--panel); position:sticky; top:0; z-index:2; }
    h1 { margin:0; font-size:20px; }
    main { display:grid; grid-template-columns: 340px 1fr; min-height:calc(100vh - 62px); }
    aside { border-right:1px solid var(--line); padding:16px; overflow:auto; background:#fbfcfc; }
    section { padding:18px 22px; overflow:auto; }
    input, select, button { font:inherit; border:1px solid var(--line); border-radius:6px; padding:9px 10px; background:#fff; color:var(--ink); }
    button { cursor:pointer; background:var(--accent); color:#fff; border-color:var(--accent); }
    .row { display:flex; gap:8px; margin-bottom:10px; }
    .row > * { min-width:0; }
    .row input { flex:1; }
    .stats { display:grid; grid-template-columns: repeat(2,1fr); gap:8px; margin:12px 0 18px; }
    .stat { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:10px; }
    .stat strong { display:block; font-size:18px; }
    .item { padding:10px; border:1px solid var(--line); border-radius:8px; background:var(--panel); margin-bottom:8px; cursor:pointer; }
    .item:hover { border-color:#9db0b8; }
    .meta { color:var(--muted); font-size:12px; margin-top:3px; word-break:break-all; }
    .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:2px 7px; font-size:12px; color:var(--muted); margin-right:4px; }
    pre { white-space:pre-wrap; word-break:break-word; background:#101820; color:#e7f1f2; padding:14px; border-radius:8px; overflow:auto; }
    article { max-width:980px; }
    .markdown { white-space:pre-wrap; background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
    @media (max-width: 820px) { main { grid-template-columns: 1fr; } aside { border-right:0; border-bottom:1px solid var(--line); } }
  </style>
</head>
<body>
  <header><h1>Techscope Web</h1></header>
  <main>
    <aside>
      <div class="row"><input id="q" placeholder="FTS или semantic query"><button id="fts">FTS</button><button id="sem">Semantic</button></div>
      <div class="row"><select id="type"><option value="">All types</option></select><select id="status"><option value="">All statuses</option></select></div>
      <div class="stats" id="stats"></div>
      <h3>Open</h3>
      <div id="open"></div>
      <h3>Documents</h3>
      <div id="docs"></div>
    </aside>
    <section><article id="content"><p>Выбери документ или запусти поиск.</p></article></section>
  </main>
  <script>
    const $ = (id) => document.getElementById(id);
    async function get(url) { const r = await fetch(url); if (!r.ok) throw new Error(await r.text()); return r.json(); }
    function esc(s) { return String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
    function item(d) { return '<div class="item" data-id="'+esc(d.id)+'"><div><span class="pill">'+esc(d.type)+'</span><span class="pill">'+esc(d.status || '-')+'</span></div><strong>'+esc(d.title || d.id)+'</strong><div class="meta">'+esc(d.path)+'</div></div>'; }
    async function loadStats() { const rows = await get('/api/stats'); $('stats').innerHTML = rows.map(r => '<div class="stat"><strong>'+r.count+'</strong>'+esc(r.name)+'</div>').join(''); }
    async function loadOpen() { const rows = await get('/api/open'); $('open').innerHTML = rows.map(item).join('') || '<p class="meta">No open items.</p>'; }
    async function loadDocs() {
      const url = new URL('/api/documents', location.origin);
      if ($('type').value) url.searchParams.set('type', $('type').value);
      if ($('status').value) url.searchParams.set('status', $('status').value);
      const rows = await get(url);
      $('docs').innerHTML = rows.map(item).join('');
      const types = [...new Set(rows.map(r => r.type).filter(Boolean))].sort();
      const statuses = [...new Set(rows.map(r => r.status).filter(Boolean))].sort();
      if ($('type').options.length === 1) types.forEach(v => $('type').append(new Option(v, v)));
      if ($('status').options.length === 1) statuses.forEach(v => $('status').append(new Option(v, v)));
    }
    async function openDoc(id) {
      const d = await get('/api/document?id=' + encodeURIComponent(id));
      $('content').innerHTML = '<h2>'+esc(d.title || d.id)+'</h2><p><span class="pill">'+esc(d.type)+'</span><span class="pill">'+esc(d.status || '-')+'</span></p><p class="meta">'+esc(d.path)+'</p><h3>Relations</h3><pre>'+esc(d.relations.map(r => r.relation_type+' '+r.target_type+' '+r.target_id).join('\\n'))+'</pre><h3>Markdown</h3><div class="markdown">'+esc(d.markdown)+'</div>';
    }
    async function fts() {
      const q = $('q').value.trim(); if (!q) return;
      const rows = await get('/api/search?q=' + encodeURIComponent(q));
      $('content').innerHTML = '<h2>FTS: '+esc(q)+'</h2>' + rows.map(r => '<div class="item" data-id="'+esc(r.id)+'"><strong>'+esc(r.title)+'</strong><div class="meta">'+esc(r.path)+' / '+esc(r.heading || '')+'</div><p>'+esc(r.snippet)+'</p></div>').join('');
    }
    async function sem() {
      const q = $('q').value.trim(); if (!q) return;
      const r = await fetch('/api/semantic?q=' + encodeURIComponent(q));
      $('content').innerHTML = '<h2>Semantic: '+esc(q)+'</h2><pre>'+esc(await r.text())+'</pre>';
    }
    document.addEventListener('click', e => { const el = e.target.closest('[data-id]'); if (el) openDoc(el.dataset.id); });
    $('fts').onclick = fts; $('sem').onclick = sem; $('type').onchange = loadDocs; $('status').onchange = loadDocs;
    loadStats(); loadOpen(); loadDocs();
  </script>
</body>
</html>`;

const server = createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/") return html(res, PAGE);
    if (url.pathname === "/api/stats") return json(res, stats());
    if (url.pathname === "/api/open") return json(res, openItems());
    if (url.pathname === "/api/documents") return json(res, documents(url.searchParams));
    if (url.pathname === "/api/search") return json(res, ftsSearch(url.searchParams.get("q") || ""));
    if (url.pathname === "/api/semantic") return text(res, semanticSearch(url.searchParams.get("q") || ""));
    if (url.pathname === "/api/document") {
      const doc = readDocument(url.searchParams.get("id") || "");
      return doc ? json(res, doc) : notFound(res);
    }
    return notFound(res);
  } catch (error) {
    json(res, { error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

server.on("error", (error) => {
  console.error(`Techscope Web listen error: ${error && error.stack ? error.stack : error}`);
  process.exitCode = 1;
});

console.log(`Techscope Web starting with cwd=${process.cwd()} host=${HOST} port=${PORT}`);
server.listen(PORT, HOST, () => {
  console.log(`Techscope Web: http://${HOST}:${PORT}`);
});
