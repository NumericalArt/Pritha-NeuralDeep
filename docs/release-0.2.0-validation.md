# Release 0.2.0 validation

The publication snapshot is the `v0.2.0` tag. Its code is identical to the
release-preparation commit that was validated below; the tag adds only this
document.

Validated on macOS on September 29, 2026:

- Full platform suite: 1468 tests passed, with no failures or skips; golden
  checks passed.
- Brief Desk suite: 15 tests passed.
- Fresh folder from the release ZIP, extracted with the system archiver and
  without Git metadata: `node scripts/bootstrap.mjs prepare --profile neuraldeep`
  passed all 16 steps in 138 seconds — isolated instance, locked Node and
  Python dependencies, NeuralDeep configuration, Brief Desk installation,
  Markdown/SQLite memory, semantic embeddings, memory validation, typecheck and
  production build. The global Codex configuration was left unchanged.
- Fresh UI/API after `bootstrap start`: the Control Center chose a free port
  next to a running instance; one stopped Brief Desk ND with a local link; no
  conversations and no configured credentials; Kimi, NeuralDeep Voice and Auto
  Search selected. The install receipt records version 0.2.0.
- Distribution audit and privacy audit passed. The pre-push audit passed its
  secret-history, forbidden-file and privacy checks; its local-path findings are
  documentation wording and a synthetic `/Users/operator` test fixture already
  present in 0.1.0.
- npm audit: zero known vulnerabilities in the production dependencies of the
  platform and the Control Center.
- The instance's NeuralDeep key occurs neither in the 1,519 files of the release
  source tree nor in any patch of the complete Git history (175 commits). Gitleaks and TruffleHog
  were not run for this release.
- Agent creation through the Control Center UI on NeuralDeep, each result
  verified by the host (`llm-operation-v1` and the managed lifecycle check),
  started from Pritha and checked by hand: Action Items Desk with qwen3.8-27b and
  with gemma-4-31b, and Flashcards Coach with qwen3.8-27b (50 minutes, one build
  attempt).

Known limits: kimi-k2.6 answered 504 for most of September 27 and could not
complete a creation run then. The child-agent broker allows 60 seconds and 4096
response tokens per call, which slow models such as gemma-4-31b can exceed.
macOS is the tested installation platform; Linux and Windows have no full
installation certification.
