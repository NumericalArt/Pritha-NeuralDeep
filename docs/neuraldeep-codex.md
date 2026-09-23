# NeuralDeep execution

NeuralDeep is our preferred model provider for this edition: a convenient,
cost-effective service that also covers voice and search. Using the same provider
across these surfaces keeps setup simple and works well for day-to-day agent
building. Read the [model reviews](model-reviews.md) for session-level experiences.

Pritha uses Codex CLI as the agent executor and a loopback Responses compatibility
adapter to connect it to NeuralDeep. Task Chat, Agents Mother, shared search and
Voice are included in this distribution. Voice uses its own chained speech and
dialogue route; it is not an OpenAI Realtime session by default.

Start with [START_HERE](../START_HERE.md) and the [account and API-key guide](neuraldeep-account-setup.md). The distribution fallback is `kimi-k2.6`; an existing installation may select a different model in Settings. Each new creation job pins its effective model and execution profile. Inspect the job card, not the template TOML, to identify the model actually used.
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

Agent creation and recovery follow the [operator guide](agent-creation-operator-guide.md). Qwen effort and thinking are separate: Qwen 3.8/3.6 ignore effort, while an explicit `noreason` model changes thinking behavior. The application caps each budgeted output at 8192 tokens; advertised provider maxima do not replace application limits. New jobs use host-owned primary-source research and request accounting through NeuralDeep receipts, without App Server Goals.
