---
id: tailscale-private-device-access-for-local-agents
type: standard
status: active
created: 2026-05-31
updated: 2026-06-23
last_reviewed: 2026-06-23
owner: Techscope/user
topics:
  - tailscale
  - device-access
  - mobile-access
  - local-agent
  - network-boundary
  - pritha
tools:
  - Tailscale
  - Tailscale Serve
  - Next.js
  - launchd
agent_platforms:
  - Codex
runtime_environment:
  - local-mac
  - mac-mini
  - browser
  - mobile-browser
config_surfaces:
  - operations/manifest.json
  - scripts/tailscale-serve.mjs
  - README.md
  - operator guide
  - launchd plist
portability: environment-specific
sources:
  - 05_decisions/2026-05-15-obsidian-web-access.md
  - 07_workflows/techscope-web.md
  - 11_agents/contracts/2026-05-25-fespa26-agent-contract.md
  - 11_agents/reports/2026-05-25-funny-teacher-agent-deployment-report.md
  - 11_agents/reports/2026-05-26-funny-teacher-launchd-deployment-report.md
  - 11_agents/reports/2026-05-29-funny-teacher-pritha-reference-example.md
  - 11_agents/reports/2026-06-01-fespa26-funny-teacher-tailscale-serve-recovery-report.md
  - 11_agents/reports/2026-06-23-fas-tailscale-control-center-routing-report.md
related:
  decisions:
    - 05_decisions/2026-05-15-obsidian-web-access.md
  reviews:
    - 11_agents/reports/2026-05-29-funny-teacher-pritha-reference-example.md
  briefs: []
  standards:
    - 04_standards/realtime-voice-control-ui.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-15
source_updated: 2026-06-23
source_version: FESPA26/Funny Teacher/Techscope Web/FAS Tailscale access pattern v1.2
retrieved: 2026-05-31
verified: 2026-06-23
valid_for: single-operator local agents exposed only to trusted devices in the same tailnet
temporal_status: version-bound
---

# Standard: tailscale private device access for local agents

Status: active
Owner: Techscope/user
Last reviewed: 2026-06-23

## Rule

Use Tailscale Serve as the default private device-access pattern for local Pritha descendants that need to be opened from another trusted device, especially a mobile phone.

The service stays local on `127.0.0.1:<local-port>`. Tailscale provides the private HTTPS URL inside the trusted tailnet. Do not use public exposure or Tailscale Funnel by default.

## Use when

- A local Mac or Mac mini runs the agent web app.
- The operator needs to open the agent from a phone, MacBook or another trusted personal device.
- Browser microphone permissions require HTTPS for mobile voice control.
- The agent is single-user or trusted-small-circle and does not yet justify a public auth/deployment layer.
- The contract selects local hosting with private remote access.

## Avoid when

- The agent is intended for public users, customers or unknown devices.
- The agent needs multi-user authorization, audit logs, roles or public availability.
- The agent handles sensitive data that should not be reachable from every device in the tailnet.
- The deployment target is already a proper cloud/VPS service with HTTPS and authentication.
- The user has not approved Tailscale setup on the host and target devices.

## Required practices

- Record Tailscale as a network boundary in the agent contract when selected.
- Keep the upstream app bound to `127.0.0.1` unless the contract explicitly requires LAN/public binding.
- Use Tailscale Serve for the HTTPS device URL.
- Treat Tailscale Funnel as a separate public-exposure decision; do not enable it as part of this pattern.
- Record the local upstream URL and intended proxy command in `operations/manifest.json` or the agent operations guide.
- Treat a child-agent Tailscale URL as ready only when it is verified against actual `tailscale serve status` state or an equivalent peer-access check. Do not synthesize a child-agent Tailscale URL by replacing `127.0.0.1` with the Control Center Tailscale host.
- Provide read-only status commands before any install/autostart action.
- Verify both local health and Tailscale health after configuration.
- Do not store Tailscale auth keys in `.env.local` for default v1 scaffolds.
- Do not install or enable long-running services without explicit operator approval.
- If the upstream process is expected to survive Codex sessions, pair Tailscale Serve with an approved service manager such as launchd.

## Initial setup shape

The FESPA26/Funny Teacher shape is:

```text
phone or trusted device browser
  -> Tailscale HTTPS URL
  -> Tailscale Serve on host Mac/Mac mini
  -> http://127.0.0.1:<local-port>
  -> local agent web app
```

Example command shape:

```sh
tailscale status
tailscale serve --bg --https=<tailscale-port> http://127.0.0.1:<local-port>
```

For Pritha Control Center, API access through the tailnet also requires trusted
Tailscale identity headers. Missing or untrusted identity must fail closed
rather than falling back to unauthenticated access.

For a default HTTPS route without a custom port, existing Techscope Web notes also use:

```sh
tailscale serve --bg <local-port>
```

Stop serving only when the operator asks or during an explicit deployment change:

```sh
tailscale serve --https=<tailscale-port> off
```

## Readiness checks

An agent using this pattern should report:

- `tailscale`: installed, authenticated, unauthenticated or missing.
- `tailnet`: current node visible through `tailscale status` or pending-auth.
- `localUpstream`: local URL and healthcheck result.
- `tailscaleServe`: configured URL, actual local proxy target and HTTP status.
- `secureContext`: pass when the phone can open the HTTPS URL.
- `microphoneOnPhone`: pass, failed or not-tested for voice agents.
- `serviceOwner`: manual dev server, launchd, external service or not configured.

## Operations rules

- `plan` and `status` commands must be read-only.
- `serve` or `install` commands should be explicit operator actions.
- If launchd is used, the deployment report must record plist path, label, start command, local URL, Tailscale URL, logs and uninstall command.
- Tailscale Serve can be configured while the upstream is down, but that state should be reported as incomplete because it produces 502-style failures.
- The operator guide should say which URL to open from the phone.
- Host self-access to a Tailscale URL is only a hairpin check. For phone or laptop workflows, readiness requires confirmation from the target device or an equivalent peer-access check.
- When multiple services share Tailscale Serve and peer access breaks, first restore the known-good reference service with the smallest Serve config, then add other services one at a time on separate HTTPS ports.
- If local upstream health is good and `tailscale ping` to peers works but browsers on peers cannot connect, reset Serve and consider a host-side Tailscale restart before changing application code.

## Security boundaries

Tailscale is a private network boundary, not application authentication.

For v1 local agents this is acceptable only when:

- the tailnet is trusted;
- the operator understands that any authorized tailnet device may reach the service URL;
- no public destructive actions happen without additional confirmation gates;
- secrets stay server-side on the host;
- public/customer access is explicitly out of scope.

If those assumptions stop being true, add application authentication or move to a stronger deployment pattern.

## Relationship to voice control UI

For browser voice agents, Tailscale HTTPS is the preferred phone access path because mobile microphone permissions need a secure context. This standard supplies the device-access layer; `04_standards/realtime-voice-control-ui.md` supplies the operator control surface.

## Agent environment compatibility

- Agent platforms: Codex-native local agents and Pritha descendants.
- Runtime environment: local Mac, Mac mini, phone browser and laptop browser inside the same tailnet.
- Config surfaces: operations manifest, deployment scripts, README/operator guide and optional launchd plist.
- Portability: environment-specific.
- Codex adaptation: make Tailscale a selected operations/network module, not an implicit default for every descendant.
- Environment-specific caveats: Tailscale CLI syntax and Serve behavior can change; verify on the host before recording a URL as ready.

## Temporal validity

- Source published: 2026-05-15.
- Source updated: 2026-06-23.
- Source version: FESPA26/Funny Teacher/Techscope Web/FAS Tailscale access pattern v1.2.
- Retrieved: 2026-05-31.
- Verified: 2026-06-23.
- Valid for: single-operator local agents exposed only to trusted devices in the same tailnet.
- Freshness status: current.
- Temporal status: version-bound.
- Recheck when: Tailscale Serve CLI changes, the agent becomes multi-user/public, mobile browser microphone rules change or the hosting target moves off local Mac/Mac mini.

## Examples

- FESPA26: local Mac-hosted voice/reportage workbench reachable from MacBook or phone through Tailscale.
- Funny Teacher: local Next.js voice learning app served through Tailscale HTTPS so phone microphone/browser access works inside the trusted tailnet.
- Techscope Web: private knowledge UI opened from MacBook or phone without public publishing.

## Related decisions

- `05_decisions/2026-05-15-obsidian-web-access.md`
