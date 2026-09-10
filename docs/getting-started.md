# Getting started with Pritha NeuralDeep

Download and extract the [ZIP](https://github.com/NumericalArt/Pritha-NeuralDeep/archive/refs/heads/main.zip),
then open the folder in Cursor, Codex, Claude Code or another local coding assistant.
Ask it: **Read START_HERE.md, then set up and start Pritha NeuralDeep.**

See [START_HERE.md](../START_HERE.md) for prerequisites, credentials and platform notes.
The installation commands are:

```sh
node scripts/bootstrap.mjs prepare --profile neuraldeep
node scripts/bootstrap.mjs start --profile neuraldeep
```

This profile installs the full Control Center and memory, creates isolated private
storage, and imports Brief Desk ND. Enter a NeuralDeep key in Settings. Voice uses
NeuralDeep; service links stay local until you configure remote access.
No background service, Telegram bot or Tailscale deployment is started implicitly.
The following sections describe the inherited agent-engineering capabilities.

## Use Pritha

You can now work in natural language. For example:

```text
Create an agent that reviews research links and reports meaningful changes.
```

This starts the agent-contract interview. The CLI fallback is:

```sh
node scripts/pritha.mjs interview
```

Pritha records the mission, runtime, interfaces, memory, tools, permissions,
research requirements, tests, and operating boundaries before scaffolding a
production agent. Generated descendants are sibling projects resolved through
`PRITHA_AGENT_PARENT` or, for legacy compatibility, the checkout parent.

For a new autonomous contract, the interview displays the default build-token
budget of `1,000,000` and asks the user to confirm it or enter another positive
JavaScript-safe integer. A non-interactive contract remains `pending` unless
both `--build-token-budget` and `--token-budget-confirmed-by user` are supplied.
An accepted autonomous contract cannot enter delivery while that confirmation
is pending; legacy accepted contracts without these fields use `1,000,000`.

## Approve And Deliver An Outcome

The agent contract describes architecture and operating boundaries. The Outcome
Spec separately describes the result the user must receive, its non-goals,
examples, demonstration, and Trials. Each document has its own review and
approval; accepting one never accepts the other.

Use the sequence **outcome init → outcome approve → deliver → delivery accept**:

```sh
node scripts/pritha.mjs outcome init <accepted-contract-path>
node scripts/pritha.mjs outcome approve <outcome-spec-path> --approved-by user
node scripts/pritha.mjs deliver <outcome-spec-path> --project <clean-git-project>
node scripts/pritha.mjs delivery status <run-id>
node scripts/pritha.mjs delivery accept <run-id> --accepted-by user
```

`deliver` requires a clean Git project. It creates a disposable worktree on an
exact `pritha/build-*` branch and leaves the active checkout unchanged. The
approved Trials and their verifier inputs are host-owned; the implementation
executor cannot rewrite them. Trial evidence is bound to the live Outcome Spec,
contract fingerprint, Git revisions, workspace state, and execution result.
Changing the approved outcome makes earlier evidence stale.

`verified` means automated Trials passed. `awaiting_acceptance` means an
operator-judged Trial or demonstration remains. Only
`delivery accept --accepted-by user` records `accepted`; none of these states
implicitly merge, push, or deploy the worktree.

If Pritha cannot safely continue, it records a typed blocker with bounded answer
options. For example, when the installed Codex runtime lacks Goal support, the
user may choose to upgrade and retry, authorize one turn with
`--answer continue-without-goal --answered-by user`, or abandon the run. The
model cannot grant that waiver. A completed turn whose Goal usage cannot be read
blocks all further iterations until the run is inspected or abandoned.

Plan worktree cleanup before applying it:

```sh
node scripts/pritha.mjs delivery cleanup <run-id>
node scripts/pritha.mjs delivery cleanup <run-id> --apply --yes
```

Clean terminal worktrees can be removed without force. Dirty worktrees stay in
place with `cleanup_required`; verified and awaiting-acceptance worktrees are
preserved. Branches and verified checkpoints are never deleted by cleanup.

A local Trial backend runs on the trusted host and does not prove sandbox
isolation. If the accepted contract requires isolation, delivery blocks before
command execution unless the selected backend probe confirms it.

## Instance-Local Child Agents

Every Pritha instance owns its own child-agent contracts, Outcome Specs,
research, reports, profiles, registry, and sibling-agent directory. With
`PRITHA_STATE_ROOT`, authored live artifacts are stored only in
`<PRITHA_STATE_ROOT>/agents/`; the compatibility fallback is the ignored
`.private/agents/`. `PRITHA_AGENT_PARENT` limits discovery and creation to that
instance's sibling-agent directory.

Live child-agent state is not committed to GitHub, promoted directly into
tracked `11_agents/`, migrated from tracked history, or copied between Pritha
instances. Reusable learning must be rewritten as an anonymized assessment,
standard, decision, or workflow and reviewed separately.

To add knowledge, put new material in `00_inbox/` or give it to Codex directly,
then ask Pritha to verify and turn it into a brief, assessment, review, decision,
or standard. Markdown remains the authored source of truth.

## Optional Functional UI And Voice

Control Center and its integrated Voice interface are active, functional
operator surfaces. They are optional because the full core workflow works in
Codex without them.

Prepare and start Control Center with:

```sh
node scripts/bootstrap.mjs --profile local --start control-center
```

This installs the locked UI dependencies when needed, verifies the selected
profile, and runs Control Center in the foreground on localhost. It does not
install launchd, cron, Tailscale, credentials, or another durable service.

The active routes include:

- `/agents` for child-agent state and actions;
- `/voice` for realtime Voice operation;
- `/settings` for local operator configuration;
- `/dev` for read-only diagnostics.

Some Voice capabilities use hosted realtime models and therefore require
explicit credentials and may incur provider costs. See [Realtime and
Voice](realtime.md) for readiness and privacy boundaries.

Verify a running UI from another terminal:

```sh
npm run control-center:health
```

## Optional Private-Device And External Access

`localhost` and `127.0.0.1` work only on the machine running Pritha. A localhost
URL or QR code will not open the service from a phone.

Use the separate [Tailscale Private Access](tailscale-private-access.md) workflow
for a trusted phone or laptop. Tailscale installation, authentication, Serve,
and every other mutating network action require explicit operator approval.
Public Funnel exposure and LAN binding are not supported defaults.

Telegram, hosted model calls, web integrations, deployment, and long-running
services are also opt-in surfaces. They are not part of core onboarding and
must follow their own credential, privacy, and approval policies.

## Bootstrap Profiles

- `minimal`: check prerequisites and authored/local memory without installing
  the full semantic profile.
- `local`: install portable local dependencies, rebuild SQLite and embeddings,
  and verify semantic memory and configured local tools.
- `control-center`: add locked Control Center dependencies, typecheck, and build.
- `control-center-tailscale`: detect Tailscale readiness only; it does not
  install Tailscale, authenticate, or configure Serve.

Useful read-only plans:

```sh
node scripts/bootstrap.mjs plan --profile minimal
node scripts/bootstrap.mjs plan --profile local
node scripts/bootstrap.mjs plan --profile control-center
```

## Verification And Help

```sh
node scripts/bootstrap.mjs verify --profile minimal
node scripts/pritha.mjs registry
node scripts/quality-gate.mjs
```

For setup failures, see [Troubleshooting](troubleshooting.md). For operational
status, private access, or service installation, follow [Operations](operations.md)
instead of enabling background processes ad hoc.
