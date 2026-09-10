# Git Hooks

This directory contains optional local hooks. They are documented but not
auto-installed.

To opt in:

```sh
git config core.hooksPath .githooks
```

To opt out:

```sh
git config --unset core.hooksPath
```

The current `pre-commit` hook runs:

```sh
node scripts/quality-gate.mjs
```

It intentionally avoids installing itself because hooks affect local developer
workflow and should be enabled by explicit user choice.
