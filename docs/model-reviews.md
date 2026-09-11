# What models say about building agents with Pritha

Five model-written reflections from agent-building and installation sessions with
Pritha and Pritha NeuralDeep, supplied by the project operator for publication.
Russian-language contributions are translated into English; English contributions
are reproduced as supplied. Model names and attributions are retained as supplied.
The accounts describe their respective sessions, including work with canonical
Pritha; their assessments are qualitative, not a comparative benchmark.

[Back to Pritha NeuralDeep](../README.md) · [Try the project](../START_HERE.md)

## Claude Fable 5.1

**Reflections on building agents**

> For a one-off demo, a straightforward prompt is several times faster. For a
> service that will run on your Mac mini, be accessible across your tailnet, be
> managed from the Control Center, and live for months, Pritha produces a
> materially better result in security, operations, and verifiability — without
> you having to read a single line of code. That is the value of an agent foundry:
> not simply “writing code,” but guaranteeing properties of that code that you
> did not ask for, yet would painfully miss later.
>
> **Overall pilot rating: 4.6/5.**

## Opus 4.8

> Yes, I could have written that dashboard in 10–15 minutes: one file of around
> 200 lines, `http.createServer`, `os.loadavg()`, `execFile('git', …)`, and inline
> HTML with `setInterval`. It would have worked and looked similar.
>
> What it almost certainly would not have included, unless specifically requested:
>
> - `execFile` with `timeout: 700`, `killSignal: 'SIGKILL'`, `maxBuffer: 256 KiB`,
>   and a sanitized environment for every `ps`/`git` invocation;
> - Git arguments including `-c core.hooksPath=/dev/null -c core.fsmonitor=false
>   --no-ext-diff --no-textconv --no-pager` — protection against another
>   repository executing code during `git log`;
> - `statfs` instead of `df`;
> - Response size limits after serialization: JSON ≤ 64 KiB, HTML ≤ 256 KiB,
>   otherwise a 503 response;
> - CSP `default-src 'none'; connect-src 'self'; frame-ancestors 'none'`,
>   `nosniff`, `no-referrer`, and `no-store`;
> - A PID file using `O_EXCL | O_NOFOLLOW`, mode `0600`, and `fsync`, plus
>   verification of process ownership through UID, start time, and command line
>   before `SIGTERM` — so Stop never kills an unrelated PID;
> - Correct shutdown: `server.close`, destruction of live sockets, and a forced
>   exit after one second;
> - A client that validates the JSON schema before rendering and writes only
>   through `textContent` and SVG DOM — not a single `innerHTML`.
>
> Most importantly, nobody would have independently checked my code. I would
> have written the tests myself, with the same blind spots as the implementation.
> Pritha wrote the verifier **before** the code, calibrated it against six valid
> and nine deliberately broken synthetic examples, and only then let the
> executor begin implementation. Six out of six Trials on a committed revision,
> with an evidence hash, provide a fundamentally different level of confidence
> from “I ran it and had a look.”
>
> The difference is not the model: Pritha itself is GPT-6 plus a harness. The
> difference is that the harness **makes** the model do what it knows how to do
> but normally skips, and prevents it from declaring success without external
> evidence.

## Cursor Grok 4.6

> I set up Pritha with a single request to the assistant: it followed `START_HERE`
> on its own, and after one NeuralDeep key everything came up — the control
> center, voice, chat, search, and memory. The Brief Desk agent arrived with the
> install, so I could just start it and see how agents work here instead of
> building a harness by hand.
>
> In use it feels like a normal local tool, not a “look how pretty this is” demo.
> NeuralDeep covers models, Voice Control, and search through one inexpensive
> provider, and the interface is enough for almost all day-to-day work. Liquid
> harness stood out separately: Pritha can update itself, its harness, and its
> memory, so knowledge and runtime don’t freeze in the shape you first downloaded.
> For building agents that’s useful because an agent lives as its own project,
> with clear boundaries and a result, not as one lucky chat.

## Gemini 3.8 Flash

> Pritha is useful as an agent foundry, not a faster chatbot: one Task Chat brief
> becomes a checkable child agent with a contract, trials, a fleet card, and real
> guardrails. Running the same brief on Neural Deep (Kimi-K2.6) proved it is not
> locked to one provider — the briefing desk came up on another model and is
> actually in use. Pritha plus NeuralDeep feels like a local agent pipeline, not
> just another coding chat.

## GPT 5.6 Terra

> While we were creating several agents, Pritha helped me maintain continuity
> between sessions: find accepted decisions, return to a verified state, and
> reuse proven approaches in the next project. That is where I see the value of
> its harness — an environment connecting a model’s capabilities with memory,
> tools, and checks on the result. Its self-learning happens through accumulated
> experience: useful decisions are selected, preserved in its knowledge and
> working procedures, and become a foundation for future work.
>
> In practice, we worked together to clarify readiness statuses, connect keys,
> and configure access; some stages required operator involvement. Even so, the
> person already has something to rely on: saved agreements, verification results,
> and an interface for managing the agents they have created. For me, Pritha’s
> main advantage is continuity: the next project can begin with accumulated
> experience, while the operator spends less time explaining the context again
> and manually connecting every stage.
