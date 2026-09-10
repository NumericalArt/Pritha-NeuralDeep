#!/usr/bin/env python3

import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone

from pritha_python_compat import apply_runtime_compat, load_pritha_runtime_env

ROOT, STATE_ROOT = load_pritha_runtime_env()
DB_PATH = (STATE_ROOT / "memory" if STATE_ROOT != ROOT else ROOT / ".memory") / "techscope.sqlite"
PROVIDER = "sentence-transformers"
MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
DIMENSIONS = 384
BATCH_SIZE = 32


def embedding_id(owner_type, owner_id, provider, model):
    raw = "|".join([owner_type, owner_id, provider, model])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def main():
    if not DB_PATH.is_file():
        raise SystemExit("Memory index missing. Run: node scripts/rebuild-memory.mjs")
    conn = sqlite3.connect(DB_PATH.as_uri() + "?mode=rw", uri=True)
    conn.row_factory = sqlite3.Row

    columns = {row["name"] for row in conn.execute("PRAGMA table_info(embeddings)")}
    if "content_hash" not in columns:
        conn.execute("ALTER TABLE embeddings ADD COLUMN content_hash TEXT")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_embeddings_identity "
        "ON embeddings(provider, model, dimensions, content_hash)"
    )

    chunks = conn.execute(
        """
        SELECT c.id, c.text, c.hash, d.type, d.path
        FROM chunks c
        JOIN documents d ON d.id = c.document_id
        WHERE d.type != 'template' AND NOT EXISTS (
          SELECT 1 FROM embeddings e WHERE e.owner_type = 'chunk' AND e.owner_id = c.id
            AND e.provider = ? AND e.model = ? AND e.dimensions = ? AND e.content_hash = c.hash
        )
        ORDER BY d.path, c.ordinal
        """, (PROVIDER, MODEL, DIMENSIONS)
    ).fetchall()

    if not chunks:
        conn.commit()
        conn.close()
        print("No missing local embeddings. Existing provider indexes preserved.")
        return

    print(f"Loading model: {MODEL}")
    apply_runtime_compat()
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(MODEL)

    texts = [row["text"] for row in chunks]
    print(f"Embedding {len(texts)} chunks...")
    vectors = model.encode(
        texts,
        batch_size=BATCH_SIZE,
        normalize_embeddings=True,
        show_progress_bar=True,
    )

    now = datetime.now(timezone.utc).isoformat()
    with conn:
        for row, vector in zip(chunks, vectors):
            owner_id = row["id"]
            conn.execute(
                """
                INSERT INTO embeddings (
                  id, owner_type, owner_id, provider, model, dimensions,
                  content_hash, vector, vector_json, created_at
                )
                VALUES (?, 'chunk', ?, ?, ?, ?, ?, NULL, ?, ?)
                ON CONFLICT(owner_type, owner_id, provider, model) DO UPDATE SET
                  id = excluded.id,
                  dimensions = excluded.dimensions,
                  content_hash = excluded.content_hash,
                  vector = excluded.vector,
                  vector_json = excluded.vector_json,
                  created_at = excluded.created_at
                """,
                (
                    embedding_id("chunk", owner_id, PROVIDER, MODEL),
                    owner_id,
                    PROVIDER,
                    MODEL,
                    DIMENSIONS,
                    row["hash"],
                    json.dumps([float(x) for x in vector], separators=(",", ":")),
                    now,
                ),
            )
        conn.execute(
            """
            DELETE FROM embeddings
            WHERE provider = ?
              AND model = ?
              AND owner_type = 'chunk'
              AND NOT EXISTS (SELECT 1 FROM chunks c WHERE c.id = embeddings.owner_id)
            """,
            (PROVIDER, MODEL),
        )

    conn.close()
    print(f"Stored {len(vectors)} embeddings in {DB_PATH}")


if __name__ == "__main__":
    main()
