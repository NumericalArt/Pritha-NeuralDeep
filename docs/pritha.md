# Using Pritha

Pritha is the preferred CLI surface.

The public repository/check-out name is Pritha. Historical `Techscope` names
remain in compatibility paths, environment variables and memory artifacts until
a separate migration removes them.

Conceptually, Pritha is a harness for an agent that builds the harness of a new
agent. It uses a genetic lineage model: a Seed carries the specification,
Descendants inherit base policies, mutation adapts the scaffold to the task,
and trial checks decide whether the result is ready for handoff.

```sh
node scripts/pritha.mjs help
node scripts/pritha.mjs questions
node scripts/pritha.mjs create --name "agent-name" --mission "mission"
node scripts/pritha.mjs research 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md --github-mode auto --github-limit 5
node scripts/pritha.mjs create 11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md
node scripts/pritha.mjs lineage
```

New contracts use the logical target `sibling of Pritha`. When scaffold runs
without `--output`, that target resolves through `PRITHA_AGENT_PARENT` (or the
legacy parent of the checkout when the variable is unset). Use `--output` only
for an explicit per-contract override. For later `test`, `publish`, handoff or
operations commands, pass the actual scaffold path printed by Pritha instead of
assuming `../agent-name` in an isolated instance.

Compatibility:

```sh
node scripts/agents-mother.mjs <command>
```

`agents-mother.mjs` prints a deprecation notice and delegates to the same implementation.

## Commands

- `questions`: print interview structure.
- `create --name --mission`: create a Seed (`agent-contract`).
- `research <contract-path>`: create a pattern pack and contract-specific
  architecture research report, including scoped GitHub repository candidates
  when relevant.
- `create <contract-path>`: scaffold a descendant from an accepted contract
  after Pritha memory research and any required current-docs verification.
- `test <project-path>`: inspect an existing or generated agent.
- `publish <project-path>`: run a no-report trial check.
- `lineage`: rebuild the registry.
- `handoff`, `operations`, `deploy`, `evolve`: lifecycle commands for generated agents.

## Contract-Aware GitHub Repository Research

The Seed controls repository discovery with these fields:

- `Repository research policy`: `auto`, `required`, `registry-only` or
  `not-applicable`;
- `Repository research topics`: any allowlisted combination of `agent-harness`,
  `agent-memory`, `agent-evals`, `mcp-tools`, `agent-skills`, `agent-interface`,
  `agent-voice` and `agent-operations`;
- `Repository research waiver reason`: required for `not-applicable`;
- `Repository adoption mode`: `none`, `reference-only` or `selected-module`.

Normal usage is:

```sh
node scripts/pritha.mjs research <contract-path> \
  --github-mode auto \
  --github-limit 5 \
  --github-timeout-ms 15000
```

Repository flags:

- `--github-mode auto|online|registry-only|skip`: `auto` reads the curated
  registry first and augments it online only for relevant scopes; `online`
  requests that augmentation when contract policy permits it; `registry-only`
  disables network requests; `skip` records a failed/pending result if the
  contract requires repository research.
- `--github-limit <1..10>`: maximum merged shortlist size, default `5`.
  Explicitly selected repositories raise the effective limit when necessary so
  none is silently dropped; more than ten selected repositories is rejected
  before network access.
- `--github-timeout-ms <1000..60000>`: per-request timeout, default `15000`.
  The complete online discovery pass is additionally bounded by a 45-second
  fail-closed deadline.
- `--github-fixture <json>`: deterministic test/development input. It never
  grants trust or adoption approval.

Unknown policy, mode or repository-topic scope values, and mixed sentinel/scope
forms, fail before any network request without echoing the rejected value; Pritha
never silently turns a typo into a fallback scope. `not-applicable` is
incompatible with every adoption mode except `none`, including
`reference-only`.

The pipeline is registry-first:

1. Derive repository scopes from the contract and current external-research
   topics.
2. Match the curated
   `01_sources/registries/github-agent-building-repos.md` registry.
3. Optionally run bounded public GitHub discovery.
4. Normalize, merge and deduplicate the shortlist in the matching
   `11_agents/research/` artifact.
5. Leave the registry unchanged.

Repository metadata, README files, issues, pull requests, manifests and scripts
are untrusted input. Discovery never clones, installs, executes, vendors, links,
activates or registers a candidate. `candidate` and `accepted-for-review` are
advisory states, not permission to use code.

If `Repository adoption mode` is `reference-only`, current
`github-repository-review` evidence must bind to every exact canonical repository
selected by the contract. Architecture evidence for another repository cannot
close that gate.

If `Repository adoption mode` is `selected-module`, the contract must also name
exactly one canonical public repository and a safe repository-relative directory
module (the v1 fields are singular) and record:

- verified immutable commit/tree pin, module tree SHA and exact GitHub tree URL;
- a module-local LICENSE or supported manifest at that exact pin;
- its exact GitHub blob URL, Git blob SHA, SHA-256 content identity, safely
  detected SPDX identifier and `license_scope: module-local`;
- compatible contract license decision covering that detected SPDX identifier;
- scripts, dependencies, references and assets security review;
- filesystem, shell, network, secrets and other permission boundaries;
- passed contract-specific eval;
- explicit user approval.

GitHub license metadata for current HEAD is advisory only and cannot satisfy the
pin-bound module license gate. A root-only license does not authorize a nested
selected module in v1.

Missing or pending adoption evidence keeps the selected module and production
scaffold blocked. `reference-only` repositories may inform architecture but are
not added to the descendant runtime. Selected-module readiness also requires a
valid `github-repository-review` external-evidence topic and completed synthesis
against Pritha memory. That evidence is matched to the exact contract
repository, module, immutable pin, license decision, permission set, eval and
explicit approval; a review of another repository cannot satisfy the gate.

The research review exposes machine-readable `repository_research_*` (including
the canonical payload and rendered-section `repository_research_lock`),
`repository_candidate_count`, `repository_adoption_status`,
`external_evidence_count`, `external_evidence_topics`, `external_research_lock`,
`synthesis_lock` and full-document `research_content_lock` fields. The synthesis
states whether fresh evidence `confirms`, `refines`, `contradicts` or
`makes-outdated` Pritha memory. Repository-mode synthesis also locks
`repository_adoption_recommendation`: `proceed` is required for scaffold,
`hold` keeps the gate pending and `reject` makes it failed.

A selected module remains `repository_adoption_status: pending-review` in the
research review. A scaffold report may use `selected-module` only when it is a
complete production scaffold and the exact module gate passed; experimental or
incomplete scaffolds remain `pending-review`.

Retrieval time alone is not source freshness. Every repository review that
authorizes an exact selected repository must independently pass freshness; one
fresh item cannot lend freshness to a stale review. A valid current evidence item
records source publication/update time or a substantive version context and
temporal-compatibility assessment. Version-based fallback additionally requires
the lock-bound enum `temporal_compatibility_status: compatible`; `incompatible`,
`unknown` and invalid supplied values remain non-authorizing. Repository text and all other external
narrative are redacted and scanned for instruction-like payloads; quarantined
prompt injection cannot satisfy topic coverage or synthesis.

Generated descendants run the shared secret/private-endpoint/prompt-injection
scanner before reading an installed skill. The skill manifest, lock and
`SKILL.md` frontmatter must agree on hash, source paths, version, source,
trust/review/risk levels and required toolsets. A selected-module provenance
manifest is a bounded regular file whose generated content hash and
`repository_research_lock` are checked by smoke and health scripts.

`repository_research_online_status: fixture` is reserved for deterministic test
input. It never claims that live GitHub metadata was retrieved.

## Contract-Selected Modules

Pritha does not copy every useful parent-agent pattern into every descendant. It
builds each agent from the modules selected by the Seed/contract: harness,
memory, data, skills, MCP, tools, evals, interfaces and operations. Optional
modules remain absent unless the contract needs them.

The initial descendant scaffold is intentionally evolvable. For Codex-native
agents, the normal continuation path is to open the descendant project in Codex
App and keep refining the agent through its own `AGENTS.md`, manifests, tests
and memory. If that agent receives a resource from the internet that does not
belong to its direct domain task, it should treat the resource as
meta-improvement material: extract lessons for its own harness, memory, tools,
skills, MCP, evals, UX or operations, then save a brief/review/decision or send
the distilled lesson back to Pritha.

Setup and status commands must state module readiness. For Pritha itself:

```sh
node scripts/setup-status.mjs --json
```

reports `harness`, `memory`, `data`, `skills` and `mcp` readiness. Future
descendants should expose the same style of module-readiness result for their
selected modules.

If a Seed selects realtime voice control, the default realtime tool surface is
internet access, agent memory access and Codex CLI sidecar access. Setup must
record readiness for those tools so voice is not treated as complete when its
supporting tool surface is missing.

Voice Control uses the same Codex task path as Codex thread for implementation
work. Risky actions such as cron/launchd enablement, service install,
deployment, deletion, secret writes or danger-full-access are held as pending
Codex tasks until the operator approves or rejects them in the UI task card.
Secret values should be entered through the child-agent credential UI, not
spoken into the Realtime session.

## Compatibility Roadmap

Pritha v0.1 is Codex-native. A Claude Code version is coming through a future
adapter path that translates selected Pritha/Codex-native project surfaces into
Claude Code-compatible guidance without replacing `AGENTS.md` as the Pritha
source of truth.
