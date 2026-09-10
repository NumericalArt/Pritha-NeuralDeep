# Releases and updates

Pritha NeuralDeep has its own repository and releases. Changes from canonical
Pritha are reviewed before inclusion. Download ZIP contains code, documentation,
curated knowledge and one complete example; it contains no credentials or runtime
history. Generated SQLite and embedding indexes are rebuilt locally.

## Create a release

Run `npm run distribution:check`, `npm test`, the Brief Desk tests, Control Center
build/typecheck and a clean ZIP installation. Scan the complete Git history with
Gitleaks. Verify localhost links, NeuralDeep Voice, Search defaults, one example
agent and empty history. Publish a tag and a matching source ZIP with SHA-256.
Never attach a live state directory, logs, secrets or compiled private state.

## Update an installation

Keep your instance pointer and external state/agent directories. Stop a foreground
instance before rebuilding, update source files, then repeat the NeuralDeep
bootstrap. Preparation does not overwrite an already installed example agent.
Review example changes separately before updating a modified child project.

Managed installations use the existing staged release manager and verified
rollback artifact. Do not build over a running `.next` directory or kill processes
by port. Existing user choices and histories survive updates. Release publication
never performs a fleet rollout or turns on Tailscale.
