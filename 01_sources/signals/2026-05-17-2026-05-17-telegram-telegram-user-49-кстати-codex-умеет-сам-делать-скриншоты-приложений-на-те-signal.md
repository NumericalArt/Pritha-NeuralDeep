---
id: 2026-05-17-2026-05-17-telegram-telegram-user-49-кстати-codex-умеет-сам-делать-скриншоты-приложений-на-те-signal
type: signal
status: refined
created: 2026-05-17
updated: 2026-06-01
topics:
  - codex
  - xcode
  - ios-simulator
  - screenshots
  - ui-debugging
  - mobile-app-development
  - coding-agents
  - dx
tools:
  - telegram-bot
  - codex
  - xcode
  - ios-simulator
  - iphone
  - macos
sources:
  - source-f6f4ae38-ccc1-4c0e-b595-bd2141b23acd
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
source_type: telegram
source_class: telegram
ingested_at: 2026-05-17
processed_at: 2026-06-01T21:03:38.430Z
retention_status: source-purged
usefulness: medium
evidence_quality: uncertain
anonymous_source_id: source-f6f4ae38-ccc1-4c0e-b595-bd2141b23acd
generated_from:
  - source-f6f4ae38-ccc1-4c0e-b595-bd2141b23acd
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
---

# Signal: source-f6f4ae38-ccc1-4c0e-b595-bd2141b23acd

Date: 2026-05-17
Status: refined
Source class: telegram
Retention: source-purged

Date: 2026-05-17
Status: refined
Signal quality: high
Extraction mode: codex-assisted
Refinement status: codex-refined

## Core signal

- Telegram post and screenshot show Codex working on a mobile UI task while an iPhone Simulator is visible and a captured screenshot appears inside the Codex thread.
- The practical signal is not just "screenshots exist"; it is that a coding agent can close the UI-debug feedback loop by inspecting app state, running commands, taking/reading screenshots and continuing the fix without the user manually copying visual evidence.
- This matters for future iOS/mobile agents: visual state should be a normal artifact in the coding loop, alongside terminal output, file diffs and tests.
- The post claims Codex can do this without extra manual setup, likely through local Xcode/iOS Simulator tooling. Treat the exact implementation as local-environment dependent until tested.
- Official OpenAI release notes for 2026-05-14 confirm Codex mobile/remote surfaces include screenshots, terminal output, diffs, test results and approvals as part of live context.

## Technical details

- Visible screenshot context:
  - task title: `Plan UI and onboarding updates`;
  - Codex reports preference state such as `hasSeenOnboarding = true`;
  - Codex ran multiple commands and is inspecting local app state;
  - iPhone 17 Pro simulator is open with a `Library` screen and `Choose a Photo` CTA;
  - Codex displays a screenshot thumbnail in its thread.
- Apple Simulator docs support screenshot/video capture from Simulator; Codex likely uses local tools/automation around this capability rather than a model-only visual trick.

## Agent design implications

- For mobile app development agents, define screenshot artifacts as first-class evidence.
- UI debugging workflow should include:
  - launch app/simulator;
  - drive or inspect state;
  - capture screenshot;
  - reason over screenshot;
  - patch code/state;
  - repeat until screenshot and tests match expected state.
- A future Techscope iOS-agent harness should expose a safe screenshot command and preserve screenshots as raw artifacts, not paste them into long Markdown.
- Compare this against Claude Code and other agents as an agent-shell-evaluation dimension: visual feedback loop support.

## Candidate rules

- If a task touches UI, the agent should capture or request visual evidence before claiming the UI is fixed.
- Screenshot-based claims must be linked to raw image files and, where possible, reproduced with commands or tests.
- For iOS work, prefer scripted simulator screenshots over manual screenshots so the workflow is repeatable.
- Do not store app screenshots containing secrets, private user data or customer data in indexed briefs; store sanitized signal only.

## Noise removed

- Social CTA asking users what coding agents they use.
- Generic comparison claim "Claude Code does not do this" kept only as verification task, not accepted as fact.

## Verification required

- Run a local experiment with Codex + Xcode/iOS Simulator: ask Codex to capture a simulator screenshot and use it to fix a simple UI issue.
- Verify whether the command path is Xcode UI automation, `xcrun simctl io booted screenshot`, app-specific screenshot tooling, or Codex Desktop integration.
- Compare with current Claude Code and other agents before making a competitive claim.

## Codex refinement notes

- Codex media review completed in Techscope thread on 2026-05-17.
- Useful for future `ios-agent-ui-debugging` workflow.
