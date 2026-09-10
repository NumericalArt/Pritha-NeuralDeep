---
id: brief-nvidia-nemoclaw-sandboxed-agent-runtime-2026-05-27
type: brief
status: draft
created: 2026-05-27
updated: 2026-05-27
topics: [nemoclaw, openshell, openclaw, sandbox, agent-security, runtime-boundary, model-routing, agents-mother]
tools: [NemoClaw, OpenShell, OpenClaw, NVIDIA, Docker, Node.js]
agent_platforms: [OpenClaw, OpenShell, Hermes, Codex]
model_context: [hosted-models, local-models, routed-inference]
runtime_environment: [local-host, docker, sandbox, messaging-gateway, remote-gpu]
config_surfaces: [blueprint.yaml, sandbox-policy.yaml, router-pool-config.yaml, AGENTS.md, agent-contract]
portability: adapter-needed
sources:
  - https://github.com/NVIDIA/NemoClaw
  - https://docs.nvidia.com/nemoclaw/latest/about/overview
  - https://docs.nvidia.com/nemoclaw/latest/about/how-it-works
  - https://docs.nvidia.com/nemoclaw/latest/reference/architecture
  - https://docs.nvidia.com/nemoclaw/latest/reference/network-policies
  - https://docs.nvidia.com/nemoclaw/latest/security/best-practices
related:
  intakes:
    - 00_inbox/links/2026-05-27-github-nvidia-nemoclaw-intake.md
  reviews:
    - 03_reviews/2026-05-27-nvidia-nemoclaw-sandboxed-agent-runtime-assessment.md
  standards:
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/agent-runtime-placement.md
    - 04_standards/agent-creation-harness.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-03-16
source_updated: 2026-05-27
source_version: github-main-e139dbcabe4d78ba9c8e503c94f0ed9e7a30ed91; latest-tag-v0.0.52
retrieved: 2026-05-27
verified: 2026-05-27
valid_for: NemoClaw alpha snapshot checked 2026-05-27
temporal_status: version-bound
---

# Brief: NVIDIA NemoClaw sandboxed agent runtime

Date: 2026-05-27
Source: https://github.com/NVIDIA/NemoClaw
Status: draft

## Summary

NemoClaw is useful to Techscope primarily as a reference architecture for sandboxing always-on agents, not as a default stack to install. The new reusable idea is a strict runtime boundary: host-side operator/control plane, sandboxed agent process, gateway-held credentials, deny-by-default egress, declarative policy presets, lifecycle logs/status and routed inference.

## Key claims

- Always-on agents need a runtime boundary because they can access network, tools, files, credentials and messaging channels for long periods.
- The agent should not hold raw provider keys. A gateway or host-side control plane should inject credentials only at the network boundary.
- External network access should start deny-by-default, then be explicitly allowed by host, method/path, binary and task need.
- Messaging channels such as Telegram/Discord/Slack should be explicit interface adapters with their own policy presets, not implicit global network access.
- Model routing can live outside the agent process: the agent calls a local inference route, while the host chooses provider/model.
- Blueprint/versioned runtime setup is safer than ad hoc manual setup for repeatable agents.

## Agent environment profile

- Agent platforms: OpenClaw/OpenShell directly; Codex indirectly by architecture pattern.
- Model context: hosted and local inference behind a gateway; optional routed inference.
- Runtime environment: host process + Docker/OpenShell sandbox + gateway.
- Config surfaces: YAML blueprints, network policy, model router config, CLI lifecycle commands.
- Portability: adapter-needed. Concepts port cleanly; NemoClaw implementation is OpenClaw/OpenShell-specific.

## Evidence

Official repository and NVIDIA docs confirm:

- alpha status and OpenClaw/OpenShell scope;
- sandbox runtime with Landlock/seccomp/netns and Docker/OpenShell topology;
- gateway-held provider credentials and inference routing via `inference.local`;
- deny-by-default network policy and operator approval flow;
- policy presets for integrations and messaging channels.

## Existing knowledge and freshness

- Related existing artifacts:
  - `04_standards/agent-untrusted-input-security.md`
  - `04_standards/agent-runtime-placement.md`
  - `04_standards/agent-creation-harness.md`
  - `02_briefs/2026-05-26-openclaw-expensive-local-ai-brief.md`
- Relationship to existing knowledge: refines.
- Official/current sources checked: GitHub repo, NVIDIA NemoClaw overview, architecture, network policy, security docs.
- Freshness status: current.
- Source published: 2026-03-16.
- Source updated: 2026-05-27.
- Source version: GitHub main `e139dbcabe4d78ba9c8e503c94f0ed9e7a30ed91`, latest tag `v0.0.52`.
- Retrieved: 2026-05-27.
- Verified: 2026-05-27.
- Valid for: NemoClaw alpha snapshot checked 2026-05-27.
- Temporal status: version-bound.
- Artifacts to mark outdated or superseded: none.

## Risks and caveats

- NemoClaw is alpha and not production-ready; do not rely on its current APIs as stable.
- It is OpenClaw/OpenShell-specific; direct adoption would be heavy for lightweight Codex-native agents.
- Docker/OpenShell adds operational complexity, platform issues and debugging overhead.
- Policy presets can look safe while still granting broad rights if applied too casually.

## Recommendation

Use NemoClaw as architectural evidence for Agents Mother runtime-boundary design. Do not adopt it as the default Techscope runtime. Add contract questions for sandbox boundary, gateway-held credentials, network policy tier and integration presets when an agent is always-on, external-facing or permission-heavy.

## Next step

Update Agents Mother contract/harness standards to include `runtime_isolation_profile` and network-policy questions for agents with external input, proactive operation, messaging adapters or broad tools.
