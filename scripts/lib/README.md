# Techscope scripts library

Shared helpers for local CLI scripts. Keep these modules small and dependency-free.

- `paths.mjs` resolves `TECHSCOPE_ROOT`, git root, sibling agent paths.
- `frontmatter.mjs` parses the project frontmatter subset used before Phase 3.
- `env.mjs` loads `.env` and `.env.local` without overriding existing env vars.
- `slug.mjs` provides slug/transliteration helpers with options for legacy Cyrillic slugs.
- `date.mjs` provides ISO `today()` and `now()`.

Do not broaden parser semantics silently. If YAML/frontmatter behavior changes,
add tests first and record it in a phase report.
