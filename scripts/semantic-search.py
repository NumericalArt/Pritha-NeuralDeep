#!/usr/bin/env python3

import json
import math
import os
import sqlite3
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

from pritha_python_compat import apply_runtime_compat, load_pritha_runtime_env

ROOT, STATE_ROOT = load_pritha_runtime_env()
DB_PATH = (STATE_ROOT / "memory" if STATE_ROOT != ROOT else ROOT / ".memory") / "techscope.sqlite"
LOCAL_PROVIDER = "sentence-transformers"
LOCAL_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
DEFAULT_LIMIT = 8


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def compact(text, limit=260):
    text = " ".join(str(text).split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "..."


def parse_args(argv):
    if not argv:
        raise SystemExit("Usage: python3 scripts/semantic-search.py <query> [--limit 8]")
    limit = DEFAULT_LIMIT
    parts = []
    i = 0
    while i < len(argv):
        if argv[i] == "--limit":
            i += 1
            limit = int(argv[i])
        else:
            parts.append(argv[i])
        i += 1
    query = " ".join(parts).strip()
    if not query:
        raise SystemExit("Missing query.")
    return query, limit


def active_selection():
    if STATE_ROOT == ROOT:
        return "local", LOCAL_PROVIDER, LOCAL_MODEL
    config_path = os.path.join(STATE_ROOT, "config", "embeddings.json")
    try:
        with open(config_path, "r", encoding="utf-8") as handle:
            config = json.load(handle)
        model = str(config.get("neuraldeep", {}).get("model") or "").strip()
        if config.get("activeProvider") == "neuraldeep" and model:
            return "neuraldeep", "neuraldeep", model
    except (OSError, ValueError, TypeError):
        pass
    return "local", LOCAL_PROVIDER, LOCAL_MODEL


def neuraldeep_query_vector(query, model):
    service = os.environ.get("PRITHA_NEURALDEEP_KEYCHAIN_SERVICE", "pritha-neuraldeep")
    if not service or any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._:-" for character in service):
        raise RuntimeError("invalid_keychain_service")
    result = subprocess.run(
        ["/usr/bin/security", "find-generic-password", "-s", service, "-w"],
        capture_output=True,
        text=True,
        timeout=5,
        check=False,
    )
    key = result.stdout.strip() if result.returncode == 0 else ""
    if not key:
        raise RuntimeError("neuraldeep_key_missing")
    base = os.environ.get("PRITHA_NEURALDEEP_API_BASE", os.environ.get("NEURALDEEP_API_BASE", "https://api.neuraldeep.ru/v1")).rstrip("/")
    parsed = urllib.parse.urlparse(base)
    loopback = parsed.hostname in {"127.0.0.1", "localhost", "::1"}
    if parsed.scheme != "https" and not (parsed.scheme == "http" and loopback):
        raise RuntimeError("unsafe_neuraldeep_api_base")
    body = json.dumps({"model": model, "input": [query], "encoding_format": "float"}).encode("utf-8")
    request = urllib.request.Request(
        f"{base}/embeddings",
        data=body,
        method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as error:
        raise RuntimeError("neuraldeep_embeddings_unavailable") from error
    vector = payload.get("data", [{}])[0].get("embedding", [])
    if not vector or any(not math.isfinite(float(value)) for value in vector):
        raise RuntimeError("invalid_neuraldeep_embedding_vector")
    numbers = [float(value) for value in vector]
    norm = math.sqrt(sum(value * value for value in numbers))
    if not math.isfinite(norm) or norm <= 0:
        raise RuntimeError("invalid_neuraldeep_embedding_norm")
    return [value / norm for value in numbers]


def embedding_rows(conn, provider, model):
    return conn.execute(
        """
        SELECT
          e.vector_json,
          c.id AS chunk_id,
          c.heading,
          c.text,
          d.id AS document_id,
          d.type,
          d.status,
          d.path,
          d.title
        FROM embeddings e
        JOIN chunks c ON c.id = e.owner_id
        JOIN documents d ON d.id = c.document_id
        WHERE e.owner_type = 'chunk'
          AND e.provider = ?
          AND e.model = ?
          AND (e.content_hash IS NULL OR e.content_hash = c.hash)
        """,
        (provider, model),
    ).fetchall()


def main():
    query, limit = parse_args(sys.argv[1:])
    if not DB_PATH.is_file():
        raise SystemExit("Memory index missing. Run: node scripts/rebuild-memory.mjs")
    conn = sqlite3.connect(DB_PATH.as_uri() + "?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row

    kind, provider, model_name = active_selection()
    rows = embedding_rows(conn, provider, model_name)

    if not rows:
        raise SystemExit("No embeddings found. Run: python3 scripts/embed-memory.py")

    if kind == "neuraldeep":
        try:
            query_vector = neuraldeep_query_vector(query, model_name)
        except RuntimeError as error:
            print(f"NeuralDeep embedding query unavailable ({error}); using retained local index.", file=sys.stderr)
            kind, provider, model_name = "local-fallback", LOCAL_PROVIDER, LOCAL_MODEL
            rows = embedding_rows(conn, provider, model_name)
            if not rows:
                raise SystemExit("NeuralDeep query failed and no local embeddings are available.")
            query_vector = local_query_vector(query)
    else:
        query_vector = local_query_vector(query)

    conn.close()

    scored = []
    for row in rows:
        vector = json.loads(row["vector_json"])
        score = dot(query_vector, vector)
        if not math.isfinite(score):
            continue
        scored.append((score, row))

    scored.sort(key=lambda item: item[0], reverse=True)

    print(f"Semantic query: {query}")
    print(f"Provider: {provider} ({kind})")
    print(f"Model: {model_name}")
    print()
    for rank, (score, row) in enumerate(scored[:limit], start=1):
        print(f"{rank}. {score:.4f} | {row['type']} | {row['status'] or '-'} | {row['path']}")
        if row["heading"]:
            print(f"   Heading: {row['heading']}")
        print(f"   {compact(row['text'])}")
        print()


def local_query_vector(query):
    apply_runtime_compat()
    from sentence_transformers import SentenceTransformer
    local_model = SentenceTransformer(LOCAL_MODEL)
    return local_model.encode([query], normalize_embeddings=True)[0]


if __name__ == "__main__":
    main()
