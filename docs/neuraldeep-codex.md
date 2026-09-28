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

Agent creation and recovery follow the [operator guide](agent-creation-operator-guide.md). Qwen effort and thinking are separate: Qwen 3.8/3.6 ignore effort, while an explicit `noreason` model changes thinking behavior. New creation jobs cap budgeted output at 32768 tokens for Qwen and Kimi K2.6 reasoning models (Gemma 4 keeps 16384 for preparation; its delivery responses are capped at 6144, because at about 8 tokens a second the provider's 15-minute window holds roughly 7k tokens), because reasoning shares the response budget, and 16384 for other models (earlier jobs keep their pinned 16384/8192). Complete provider rejections (429/502/503/504) are recorded as zero-token `provider_rejected` attempts and resent up to three times with identical bytes before a turn fails. A buffered preparation response whose stream breaks before any byte reaches Codex is resent the same way; that attempt settles at its reservation (`stream_broken_upper_bound`) because the provider may have spent tokens. Older pinned profiles and preparation limits remain unchanged; a larger per-response ceiling does not increase the job or phase allocation. These application limits are not provider maxima or evidence of successful end-to-end creation. New jobs use host-owned primary-source research and request accounting through NeuralDeep receipts, without App Server Goals.
