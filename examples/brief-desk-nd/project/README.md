# Brief Desk ND

A local briefing editor: **topic → sources → draft → edit → approve → Telegram**.
A complete example agent included with Pritha NeuralDeep. Node.js 24+, no npm
runtime dependencies, localhost only, manual startup.

## Start

Use Start on its Pritha agent card, or run `node server.mjs` from this folder.
Open the local address shown in the terminal. **Open demo** needs no keys and
contains a synthetic brief, not somebody else's history.

## Settings

Choose the parent Pritha NeuralDeep credential or enter your own key. The parent
reference contains only an instance-specific Keychain service name; no key is
copied into the project. The parent web server need not stay open. An existing
own key remains selected when upgrading an older agent. Environment values take
precedence and must be changed in that environment.

Telegram is optional for creating and editing briefs. Configure its bot token
and destination in Settings, check access, then explicitly approve publication.
[Connect Telegram](docs/telegram.md). No incoming bot command loop is started.

Secrets live only in `.env.local` or the server environment; state lives in
`.data`. Both are ignored by Git. Keep these files when updating your agent.

Run `npm test` for isolated tests with temporary data and mocked providers.
No real Telegram message is sent by the test suite.
