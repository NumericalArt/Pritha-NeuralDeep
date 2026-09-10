# Prerequisites

See [START_HERE.md](../START_HERE.md) for the complete NeuralDeep installation path.
Use Node.js 24+, Python 3.10+ (recommended), Git, SQLite CLI and Codex CLI. Python 3.9
compatibility remains in the inherited runtime; use a newer Python for new machines.
Codex CLI runs tasks internally through NeuralDeep even when Cursor or Claude Code
performs the installation. No ChatGPT subscription login is required for this path.

`node scripts/bootstrap.mjs prepare --profile neuraldeep` installs locked npm and
Python dependencies, indexes the bundled Markdown, downloads the embedding model
on first use, and builds the interface. Allow network access and several gigabytes
of free disk space for dependencies and model files. No NeuralDeep key is needed
for this installation and the offline Brief Desk demo.

macOS is the primary tested platform. Linux and Windows are allowed; their setup,
credential environment and service management are the user's responsibility.
