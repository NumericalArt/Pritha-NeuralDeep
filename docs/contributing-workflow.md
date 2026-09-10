# Contributing Workflow

## Intake to Standard

1. Add source material to `00_inbox/`.
2. Capture source date, retrieved date, version and temporal status.
3. Create a brief or assessment.
4. Compare with existing standards and decisions.
5. Mark outdated artifacts as `outdated` or `superseded`; do not delete them.
6. Promote to a standard only after evidence and trade-offs are clear.

## Agent Seed Workflow

1. Run `node scripts/pritha.mjs questions`.
2. Create a seed with `node scripts/pritha.mjs create --name ... --mission ...`.
3. Validate and research the seed.
4. Scaffold a descendant.
5. Test, hand off and record post-creation lessons.

## PR Rule

One phase or coherent change per pull request. Run quality checks and link the phase report.

## Push Rule

Use `docs/github-publish-and-push.md` as the source of truth for first GitHub
publication and later pushes. At minimum, before pushing to `main` run:

```sh
node scripts/validate-memory.mjs
npm test --silent
node scripts/quality-gate.mjs
node scripts/pre-push-audit.mjs
```

For release work, also run:

```sh
node scripts/golden-checks.mjs --with-embeddings
node scripts/github-release-status.mjs --online --strict
```
