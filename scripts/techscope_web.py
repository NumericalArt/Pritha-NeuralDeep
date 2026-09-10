#!/usr/bin/env python3

import html
import json
import os
import sqlite3
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


def resolve_root():
    if os.environ.get("TECHSCOPE_ROOT"):
        return Path(os.environ["TECHSCOPE_ROOT"]).expanduser().resolve()
    try:
        output = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            text=True,
            capture_output=True,
            check=True,
        ).stdout.strip()
        if output:
            return Path(output).resolve()
    except Exception:
        pass
    return Path.cwd().resolve()


ROOT = resolve_root()
STATE_ROOT = Path(os.environ["PRITHA_STATE_ROOT"]).expanduser().resolve() if os.environ.get("PRITHA_STATE_ROOT") else ROOT
DB_PATH = STATE_ROOT / "memory" / "techscope.sqlite" if STATE_ROOT != ROOT else ROOT / ".memory" / "techscope.sqlite"
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "3000"))


PAGE = """<!doctype html>
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
    .row input { flex:1; min-width:0; }
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
      <h3>Open</h3><div id="open"></div>
      <h3>Documents</h3><div id="docs"></div>
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
</html>"""


def rows(sql, args=()):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        return [dict(row) for row in conn.execute(sql, args).fetchall()]
    finally:
        conn.close()


def send_json(handler, value, status=200):
    data = json.dumps(value, ensure_ascii=False, indent=2).encode("utf-8")
    handler.send_response(status)
    handler.send_header("content-type", "application/json; charset=utf-8")
    handler.send_header("cache-control", "no-store")
    handler.send_header("content-length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


def send_text(handler, value, content_type="text/plain; charset=utf-8", status=200):
    data = value.encode("utf-8")
    handler.send_response(status)
    handler.send_header("content-type", content_type)
    handler.send_header("cache-control", "no-store")
    handler.send_header("content-length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        try:
            if parsed.path == "/":
                return send_text(self, PAGE, "text/html; charset=utf-8")
            if parsed.path == "/api/stats":
                return send_json(self, rows("""
                    SELECT 'documents' AS name, COUNT(*) AS count FROM documents
                    UNION ALL SELECT 'chunks', COUNT(*) FROM chunks
                    UNION ALL SELECT 'entities', COUNT(*) FROM entities
                    UNION ALL SELECT 'relations', COUNT(*) FROM relations
                    UNION ALL SELECT 'embeddings', COUNT(*) FROM embeddings
                """))
            if parsed.path == "/api/open":
                return send_json(self, rows("""
                    SELECT id, type, status, path, title
                    FROM documents
                    WHERE status IN ('new', 'draft', 'proposed')
                      AND type != 'template'
                    ORDER BY type, path
                """))
            if parsed.path == "/api/documents":
                clauses, args = [], []
                if params.get("type", [""])[0]:
                    clauses.append("type = ?")
                    args.append(params["type"][0])
                if params.get("status", [""])[0]:
                    clauses.append("status = ?")
                    args.append(params["status"][0])
                where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
                return send_json(self, rows(f"""
                    SELECT id, type, status, path, title, updated_at
                    FROM documents
                    {where}
                    ORDER BY type, path
                    LIMIT 200
                """, args))
            if parsed.path == "/api/search":
                q = params.get("q", [""])[0]
                if not q:
                    return send_json(self, [])
                return send_json(self, rows("""
                    SELECT d.id, d.type, d.status, d.path, d.title, c.heading,
                           snippet(chunks_fts, 0, '[', ']', ' ... ', 18) AS snippet
                    FROM chunks_fts
                    JOIN chunks c ON c.id = chunks_fts.chunk_id
                    JOIN documents d ON d.id = chunks_fts.document_id
                    WHERE chunks_fts MATCH ?
                    ORDER BY rank
                    LIMIT 30
                """, (q,)))
            if parsed.path == "/api/semantic":
                q = params.get("q", [""])[0]
                if not q:
                    return send_text(self, "")
                result = subprocess.run(
                    ["/usr/bin/python3", "scripts/semantic-search.py", q, "--limit", "8"],
                    cwd=ROOT,
                    text=True,
                    capture_output=True,
                    env=os.environ.copy(),
                    timeout=60,
                )
                return send_text(self, result.stdout if result.returncode == 0 else result.stderr, status=200 if result.returncode == 0 else 500)
            if parsed.path == "/api/document":
                doc_id = params.get("id", [""])[0]
                found = rows("SELECT id, path, type, status, title FROM documents WHERE id = ? LIMIT 1", (doc_id,))
                if not found:
                    return send_json(self, {"error": "not_found"}, 404)
                doc = found[0]
                doc["markdown"] = (ROOT / doc["path"]).read_text(encoding="utf-8")
                doc["relations"] = rows("""
                    SELECT relation_type, target_type, target_id
                    FROM relations
                    WHERE source_id = ?
                    ORDER BY relation_type, target_type, target_id
                """, (doc_id,))
                return send_json(self, doc)
            return send_json(self, {"error": "not_found"}, 404)
        except Exception as error:
            return send_json(self, {"error": str(error)}, 500)

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args), flush=True)


if __name__ == "__main__":
    print(f"Techscope Web Python: http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
