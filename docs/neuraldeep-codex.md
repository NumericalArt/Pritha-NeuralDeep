# NeuralDeep execution

Pritha uses Codex CLI as the agent executor and a loopback Responses compatibility
adapter to connect it to NeuralDeep. Task Chat, Agents Mother, shared search and
Voice are included in this distribution. Voice uses its own chained speech and
dialogue route; it is not an OpenAI Realtime session by default.

Start with [START_HERE](../START_HERE.md). The default task model is `kimi-k2.6`.
The CLI launcher can also be used directly after bootstrap:

```sh
npm run neuraldeep:status
npm run neuraldeep:codex
npm run neuraldeep:codex -- --model gpt-oss-120b
```

An isolated Codex home and state root keep sessions separate from other Pritha
instances. Authentication is resolved by a local helper: instance-specific macOS
Keychain, or explicit `PRITHA_NEURALDEEP_API_KEY` server environment. Diagnostics
show only credential status. Runtime configs contain references, not keys.

The adapter supplies Responses lifecycle events required by Codex. Provider
limits, model availability and usage still apply. Search is a local MCP service
backed by NeuralDeep; see [Search](neuraldeep-search.md).
