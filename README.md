<p align="center">
  <img src="docs/assets/pritha-logo.png" alt="Pritha NeuralDeep" width="200">
</p>
<h1 align="center">Pritha NeuralDeep</h1>
<p align="center"><strong>From an idea to an agent. With knowledge that stays with you.</strong></p>
<p align="center">A local agent foundry, research workspace and knowledge system powered by NeuralDeep.</p>
<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-a78bfa"></a>
  <img alt="Node.js 24+" src="https://img.shields.io/badge/Node.js-24%2B-43853d">
  <img alt="Active beta" src="https://img.shields.io/badge/status-active_beta-d9a441">
</p>
<p align="center"><a href="#get-started">Get started</a> · <a href="START_HERE.md">Installation</a> · <a href="#meet-brief-desk-nd">Example agent</a> · <a href="docs/neuraldeep-search.md">Search & research</a> · <a href="docs/model-reviews.md">Model reviews</a></p>

Pritha NeuralDeep turns an idea, project or workflow into a specialist-agent
project you can inspect, test and improve. It brings together a complete local
Control Center, a curated engineering knowledge base and NeuralDeep model access.

This is an independent distribution of [Pritha](https://github.com/NumericalArt/Pritha).
It includes the platform and its reusable knowledge, with a fresh workspace for
your own tasks. Your API keys, conversations and agent data stay out of Git.

## Why NeuralDeep

**NeuralDeep is our preferred provider for this edition: convenient, cost-effective,
and a great fit for everyday agent work.** One provider connection brings together
model execution, Voice Control, and web search. That means less integration work
and a straightforward path from installing Pritha to using its full workspace.
Brief Desk ND can reuse the same NeuralDeep credential, making it easy to start
working with a real agent straight away.

The installation and agent-building experiences below describe what this feels
like in practice.

## Get started

1. **[Download the repository as a ZIP](https://github.com/NumericalArt/Pritha-NeuralDeep/archive/refs/heads/main.zip)** and extract it.
2. Open the extracted folder in **Cursor, Codex, Claude Code**, or another coding assistant that can read files and run local commands.
3. Ask:

```text
Read START_HERE.md, then set up and start Pritha NeuralDeep.
```

The assistant installs dependencies, rebuilds local memory, sets up an isolated
instance and opens the local Control Center. Enter your **own NeuralDeep API key**
in **Settings → NeuralDeep**. Do not paste keys into the assistant conversation.

**Need a key?** [Register with NeuralDeep](https://neuraldeep.ru/app), copy the key
from your dashboard, and connect it in Pritha Settings.
[Quick account and API-key guide](docs/neuraldeep-account-setup.md) — including
provider advantages and access to the default Kimi model.

Prefer a terminal?

```sh
node scripts/bootstrap.mjs prepare --profile neuraldeep
node scripts/bootstrap.mjs start --profile neuraldeep
```

**Requirements:** Node.js 24+, Python 3.10+, Git, SQLite CLI and Codex CLI.
The installation assistant can be any suitable coding tool; **Codex CLI is still
used internally to execute agent tasks through the NeuralDeep adapter**.

macOS is the primary tested platform. Linux and Windows are not blocked, but
installation, credential setup and service management are self-managed and have
not received full end-to-end verification. See [installation details](START_HERE.md).

## Your workspace

| Surface | What you can do |
| --- | --- |
| **Agents** | Design, inspect, test and evolve specialist agents using contracts and outcome specifications. |
| **Task Chat** | Work on tasks with persistent local history, attachments and execution status. |
| **Voice Control** | Talk to Pritha through NeuralDeep speech and dialogue, and hand work to the task executor. |
| **Search & Research** | Use shared web search and source reading in Chat and Voice, or run a bounded research task. |
| **Knowledge** | Reuse curated standards, decisions, workflows, templates and engineering lessons. |
| **Settings** | Connect NeuralDeep, choose models, inspect usage and configure optional integrations. |

The distribution starts with **Kimi for tasks**, **NeuralDeep Voice**, and **NeuralDeep
Search in Auto mode**. Search is enabled for Chat, Voice and Research; child-agent
access still requires an explicit allowlist. Automatic SearXNG fallback is off.
These defaults match the accepted local configuration; search relevance and source
freshness still need review. Auto is configurable in Settings and makes metered
provider calls when a task needs external information.

All service links start on **localhost**. Tailscale, remote access and automatic
service startup are separate opt-in setup steps.

## Meet Brief Desk ND

One complete example agent is included:

**topic → sources → draft → edit → approve → Telegram**

Open its card in Agents, click **Start**, then open its local interface. Its offline
demo works without API keys. Settings lets you use the parent Pritha NeuralDeep
credential or an independent key, and optionally connect a Telegram bot and channel.
Telegram is not required to create and edit briefs. Nothing is posted automatically.

[Brief Desk guide](examples/brief-desk-nd/project/README.md) ·
[Connect Telegram](examples/brief-desk-nd/project/docs/telegram.md)

No other live agents are bundled. Task Chat, Voice, Drafts and Brief Desk history
start empty; historical engineering lessons remain available as shared knowledge.

## From models that worked with Pritha

Model-written reflections supplied by the project operator, covering Pritha and
Pritha NeuralDeep. Read the [full reviews and their context](docs/model-reviews.md).

> “NeuralDeep covers models, Voice Control, and search through one inexpensive
> provider, and the interface is enough for almost all day-to-day work.”
>
> — **Cursor Grok 4.6**

> “Pritha plus NeuralDeep feels like a local agent pipeline, not just another coding chat.”
>
> — **Gemini 3.8 Flash**

The full collection also includes **Claude Fable 5.1** (pilot rating **4.6/5**),
**Opus 4.8** on verification and operational safeguards, and **GPT 5.6 Terra** on
memory and continuity between projects.

## How it is packaged

- **Code and knowledge:** authored files in this repository.
- **Local state:** a separate instance directory for sessions, settings, queues and generated indexes.
- **Your agents:** a separate directory belonging to this instance; unrelated sibling folders are not imported.
- **Memory:** rebuilt from curated Markdown. Pre-existing conversation databases are never shipped.
- **Credentials:** macOS Keychain for Pritha; server environment for manual setups; local ignored configuration for a Brief Desk override.

Model, speech and search requests go to NeuralDeep. Optional Telegram publication
sends the approved brief to your selected destination. Local-first does not mean
inference is offline.

## Documentation

- [Get a NeuralDeep account and API key](docs/neuraldeep-account-setup.md)
- [Model reviews](docs/model-reviews.md)
- [Installation and first run](START_HERE.md)
- [NeuralDeep execution](docs/neuraldeep-codex.md)
- [Search and bounded research](docs/neuraldeep-search.md)
- [Architecture](docs/architecture.md) · [Memory](docs/memory.md)
- [Release and updates](docs/release.md)
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

The public getting-started documentation is in English. The inherited engineering
knowledge base and parts of the application retain their original Russian content.

## License

[MIT](LICENSE). Based on [NumericalArt/Pritha](https://github.com/NumericalArt/Pritha),
with a separate NeuralDeep runtime, release process and bundled example agent.
