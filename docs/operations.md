# Operations

Pritha is local-first. Long-running services are optional and must be explicit.

## Health

```sh
node scripts/smoke-test.mjs
node scripts/healthcheck.mjs
node scripts/quality-gate.mjs
node scripts/self-test.mjs
```

## Web

```sh
HOST=127.0.0.1 PORT=3000 node scripts/techscope-web.mjs
```

## Services

Do not install `launchd` jobs silently. Use plan/status first and require explicit approval for mutating commands.

Generated descendants may include:

```sh
node scripts/operations-status.mjs
node scripts/deploy-service.mjs plan
node scripts/deploy-service.mjs status
```

## Instance and fleet updates

```sh
node scripts/pritha-instance.mjs status --json
node scripts/pritha-instance.mjs migrate --plan --json
node scripts/pritha-instance.mjs update --plan --json
node scripts/pritha-fleet.mjs status --manifest "$PRITHA_FLEET_CONFIG"
node scripts/pritha-fleet.mjs rollout --manifest "$PRITHA_FLEET_CONFIG"
```

Apply commands require `--apply --yes`. Fleet rollout is ordered by the local
manifest and stops at the first failed instance. No scheduler, cron or launchd
job is installed by these commands.
