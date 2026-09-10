---
id: historical-engineering-cc3f9e07abcb
type: review
status: processed
created: 2026-09-10
updated: 2026-09-10
topics: [agent-engineering, reusable-patterns]
tools: [Node.js, Codex]
sources: [reviewed-historical-engineering-evidence]
related: {}
memory_domain: agent-building-knowledge
privacy: public
---

# Historical engineering lessons

De-identified engineering notes retained from earlier agent work. These are
historical observations, not installed agents or current verification claims.

## Selected Patterns

### pattern-01: Tailscale private access standard

- Source: `04_standards/tailscale-private-device-access-for-local-agents.md`
- Kind: normative standard.
- Applicability: high.
- Pattern: keep the upstream app on `127.0.0.1:<local-port>` and use
  Tailscale Serve for private HTTPS access inside the trusted tailnet.
- Constraints: no Funnel by default, no auth keys in v1 scaffolds, no service
  install/autostart without explicit approval, and peer-device access is the
  acceptance check.

### pattern-02: Pritha Tailscale workflow

- Source: `docs/tailscale-private-access.md`
- Kind: operator workflow.
- Applicability: high.
- Pattern: read-only commands first; `install`, `serve`, `off`, `tailscale up`,
  auth-key work, Funnel, launchd and cron need explicit operator approval.
- Implementation implication: reference-agent should use the generic helper with
  `--app reference-agent --port 3724 --health-path /api/health`.

### pattern-03: reference-agent optional trusted-tailnet metadata

- Source: `<USER_HOME>/reference-agent/operations/manifest.json`
- Kind: sibling operations pattern.
- Applicability: high.
- Pattern: manual local runtime, autostart disabled, local upstream URL,
  placeholder Tailscale URL metadata, and a non-secret proxy command shape.
- Fit for reference-agent: strong. reference-agent is also a local manual web agent and
  should mirror this lightweight metadata shape instead of adding a new service.

### pattern-04: reference-agent Tailscale Serve shape

- Source: `<USER_HOME>/reference-agent/operations/manifest.json`
- Kind: sibling operations pattern.
- Applicability: medium.
- Pattern: a local app behind Tailscale Serve with a trusted-device HTTPS URL.
- Fit for reference-agent: confirms the proxy architecture, but voice/microphone
  and production-preview details are not needed.

### pattern-05: reference-agent persistent service is not the default fit

- Source: `<USER_HOME>/reference-agent/operations/manifest.json`
- Kind: sibling operations counter-pattern.
- Applicability: medium as a boundary.
- Pattern: launchd service plus Tailscale Serve helper scripts.
- Fit for reference-agent: do not copy launchd, autostart, recovery scripts or
  persistent service behavior because the operator requested minimal changes
  and no deployment/infrastructure expansion.

### pattern-06: reference-agent no-Tailscale baseline

- Source: `<USER_HOME>/reference-agent/operations/manifest.json`
- Kind: sibling negative example.
- Applicability: medium.
- Pattern: a local Control Center agent can remain local-only unless Tailscale
  access is explicitly selected.
- Fit for reference-agent: the new metadata should be intentional and scoped, not
  treated as a default for all descendants.


## Verification Pattern

1. Run reference-agent local checks.
2. Run Pritha read-only Tailscale helper checks for reference-agent.
3. If Serve is required and the exact command matches the operator-approved
   shape, run only that private Serve command.
4. Confirm local Tailscale status with real identifiers redacted.
5. Treat peer-device opening of the private URL as the final acceptance check.
