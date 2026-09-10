# Contributing

Use Node.js 24 and an isolated checkout/state directory. Never develop against
another user's private runtime. Read AGENTS.md for the engineering conventions.

Run `npm ci --ignore-scripts`, `npm --prefix interfaces/control-center ci --ignore-scripts`,
then `npm test`. UI changes also require typecheck and a production build. Example
changes require `npm --prefix examples/brief-desk-nd/project test`. Verify the
publication boundary with `npm run distribution:check`.

Keep PRs focused on observable behavior and include the checks performed. Never
add credentials, transcripts, private IDs or generated runtime databases.
