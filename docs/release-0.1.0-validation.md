# First release validation

The publication snapshot includes the completed NeuralDeep Search changes from
source commit `9a9a7a8defe5c6b603eb1b6bac53e3610839609d`.

Validated on macOS on September 10, 2026:

- Full platform quality gate: 937 tests passed; no failures or skips.
- Brief Desk suite: 15 tests passed, including settings, secret masking, shared
  credential selection, offline demo and explicit Telegram publication gates.
- Fresh folder bootstrap without Git metadata: dependency installation, local
  instance creation, Markdown/SQLite memory, semantic embeddings, typecheck and
  production build all passed. Preparation was repeatable without replacing the
  installed example.
- Fresh UI/API: one stopped Brief Desk ND under Active; no Drafts, conversations
  or configured credentials. Kimi, NeuralDeep Voice and Auto Search selected.
- Localhost links remained local even on a computer with Tailscale installed.
- Brief Desk started through the Control Center, and its offline demo and
  Settings rendered correctly without provider credentials.
- Dependency audits: zero known npm vulnerabilities at publication time after
  updating Next.js to 16.3.4 and its affected transitive dependencies.
- Distribution audit, privacy audit and Gitleaks passed. Synthetic secret-detector
  fixtures and two non-secret identifiers carry narrowly scoped inline exclusions.

No real Telegram message was sent during release checks. A new user's provider
account, microphone, bot and separate-computer installation still require their
own end-to-end test. Linux and Windows have no full installation certification.
The bundled example carries no fabricated historical delivery acceptance.
