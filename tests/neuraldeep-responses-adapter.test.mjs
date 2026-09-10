import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import {
  closeNeuralDeepAdapter,
  createNeuralDeepAdapter,
  listenNeuralDeepAdapter,
  normalizeResponsesSse,
} from "../scripts/neuraldeep/responses-adapter.mjs";

function invokeAdapter(options) {
  const server = createNeuralDeepAdapter(options);
  const request = Object.assign(Readable.from([Buffer.from("{}")]), { method: "POST", url: "/v1/responses", headers: {} });
  const response = Object.assign(new EventEmitter(), {
    setHeader() {},
    writeHead(status) { this.status = status; },
    end(body) { this.body = body; this.writableEnded = true; },
  });
  return { response, finished: server.listeners("request")[0](request, response) };
}

test("default upstream deadline permits five-minute waits and aborts at 930 seconds", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const dispatched = Promise.withResolvers();
  const observed = [];
  const { response, finished } = invokeAdapter({
    fetchImpl: async (_url, { signal }) => {
      dispatched.resolve(signal);
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    },
    onRequest: event => observed.push(event),
  });
  const signal = await dispatched.promise;
  t.mock.timers.tick(300_000);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(629_999);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  await finished;
  assert.equal(response.status, 502);
  assert.equal(observed.length, 1);
  assert.equal(observed[0].durationMs, 930_000);
  assert.deepEqual(observed[0].timings, {
    upstreamStartedAt: new Date(0).toISOString(), firstByteMs: null, lastByteMs: null,
    responseCompletedMs: null, responseBytes: 0, timedOut: true,
  });
});

test("records first byte, last byte and completed response without recording its contents", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const observed = [];
  const body = Buffer.from('{"private":"fixture-secret"}');
  const { response, finished } = invokeAdapter({
    fetchImpl: async () => ({ status: 200, ok: true, headers: new Headers(), body: (async function* () {
      yield Buffer.alloc(0);
      t.mock.timers.tick(300_001);
      yield body.subarray(0, 5);
      t.mock.timers.tick(100);
      yield body.subarray(5);
      t.mock.timers.tick(50);
    })() }),
    onRequest: event => observed.push(event),
  });
  await finished;
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, body);
  assert.deepEqual(observed[0].timings, {
    upstreamStartedAt: new Date(0).toISOString(), firstByteMs: 300_001, lastByteMs: 300_101,
    responseCompletedMs: 300_151, responseBytes: body.length, timedOut: false,
  });
  assert.doesNotMatch(JSON.stringify(observed), /fixture-secret/);
});

test("a stalled body preserves first-byte evidence but never reports response completion", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const read = Promise.withResolvers(), observed = [];
  const { response, finished } = invokeAdapter({
    fetchImpl: async (_url, { signal }) => ({ body: (async function* () {
      t.mock.timers.tick(100);
      yield Buffer.from("partial");
      const aborted = new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
      read.resolve();
      await aborted;
    })() }),
    onRequest: event => observed.push(event),
  });
  await read.promise;
  t.mock.timers.tick(929_900);
  await finished;
  assert.equal(response.status, 502);
  assert.equal(observed[0].timings.firstByteMs, 100);
  assert.equal(observed[0].timings.lastByteMs, 100);
  assert.equal(observed[0].timings.responseBytes, 7);
  assert.equal(observed[0].timings.responseCompletedMs, null);
  assert.equal(observed[0].timings.timedOut, true);
});

function sse(events) {
  return `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
}

function parsedEvents(raw) {
  return raw
    .split("\n\n")
    .map((block) => block.replace(/^data: /, ""))
    .filter((value) => value && value !== "[DONE]")
    .map((value) => JSON.parse(value));
}

test("rebuilds message lifecycle from response.completed", () => {
  const raw = sse([
    { type: "response.created", sequence_number: 10, response: { id: "resp_1", output: [] } },
    {
      type: "response.output_item.added",
      sequence_number: 11,
      output_index: 0,
      item: { id: "reason_1", type: "reasoning", status: "in_progress", summary: [] },
    },
    {
      type: "response.output_text.delta",
      sequence_number: 12,
      item_id: "reason_1",
      output_index: 0,
      content_index: 0,
      delta: "misattributed",
    },
    {
      type: "response.completed",
      sequence_number: 13,
      response: {
        id: "resp_1",
        status: "completed",
        output: [
          { id: "reason_1", type: "reasoning", status: "completed", summary: [] },
          {
            id: "msg_1",
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text: "Готово", annotations: [] }],
          },
        ],
      },
    },
  ]);

  const events = parsedEvents(normalizeResponsesSse(raw));
  assert.deepEqual(events.map((event) => event.sequence_number), events.map((_, index) => index));
  assert.equal(events.some((event) => event.delta === "misattributed"), false);
  assert.equal(events.find((event) => event.type === "response.output_text.delta")?.delta, "Готово");
  assert.equal(events.find((event) => event.type === "response.output_item.added" && event.item.type === "message")?.item.id, "msg_1");
  assert.equal(events.at(-1).type, "response.completed");
  assert.match(normalizeResponsesSse(raw), /data: \[DONE\]\n\n$/);
});

test("preserves function-call lifecycle without inventing a message", () => {
  const functionCall = {
    id: "call_item_1",
    type: "function_call",
    status: "completed",
    name: "exec_command",
    call_id: "call_1",
    arguments: "{\"cmd\":\"pwd\"}",
  };
  const raw = sse([
    { type: "response.created", response: { id: "resp_2", output: [] } },
    { type: "response.output_item.added", output_index: 0, item: { ...functionCall, status: "in_progress", arguments: "" } },
    { type: "response.function_call_arguments.delta", item_id: "call_item_1", output_index: 0, delta: functionCall.arguments },
    { type: "response.output_item.done", output_index: 0, item: functionCall },
    { type: "response.completed", response: { id: "resp_2", status: "completed", output: [functionCall] } },
  ]);

  const events = parsedEvents(normalizeResponsesSse(raw));
  assert.equal(events.filter((event) => event.type === "response.output_item.added").length, 1);
  assert.equal(events.some((event) => event.item?.type === "message"), false);
  assert.equal(events.some((event) => event.type === "response.function_call_arguments.delta"), true);
  const missingTerminalOutput = parsedEvents(raw);
  missingTerminalOutput.at(-1).response.output = [];
  assert.equal(parsedEvents(normalizeResponsesSse(sse(missingTerminalOutput))).some(event => event.type === "response.function_call_arguments.delta"), true);
});

test("retains a streamed public answer omitted from the terminal response snapshot", () => {
  const message = {id:"msg_answer",type:"message",role:"assistant",status:"completed",content:[{type:"output_text",text:"ND_STEP_1_OK"}]};
  for (const lifecycle of [true,false]) {
    const events = parsedEvents(normalizeResponsesSse(sse([
      {type:"response.created",response:{id:"resp_missing",output:[]}},
      {type:"response.output_text.delta",item_id:"reason_mislabelled",output_index:0,content_index:0,delta:"ND_STEP_"},
      {type:"response.output_text.delta",item_id:"reason_mislabelled",output_index:0,content_index:0,delta:"1_OK"},
      {type:"response.output_text.done",item_id:"reason_mislabelled",output_index:0,content_index:0,text:"ND_STEP_1_OK"},
      ...(lifecycle ? [{type:"response.output_item.done",output_index:1,item:message}] : []),
      {type:"response.completed",response:{id:"resp_missing",status:"completed",output:[{id:"reason_mislabelled",type:"reasoning",summary:[]}]}}
    ])));
    const answers=events.filter(event=>event.type==="response.output_item.done"&&event.item.type==="message");
    assert.equal(answers.length,1);
    assert.equal(answers[0].item.content[0].text,"ND_STEP_1_OK");
    assert.notEqual(answers[0].item.id,"reason_mislabelled");
    assert.equal(answers[0].output_index,1);
    assert.deepEqual(events.at(-1).response.output[1],answers[0].item);
  }
});

test("reasoning alone is an explicit empty-response failure and is never exposed as an answer", () => {
  assert.throws(()=>normalizeResponsesSse(sse([
    {type:"response.reasoning_text.delta",item_id:"reason_only",delta:"private reasoning fixture"},
    {type:"response.completed",response:{id:"resp_empty",status:"completed",output:[{id:"reason_only",type:"reasoning",summary:[]}]}}
  ])),error=>error.code==="neuraldeep_empty_response"&&!error.message.includes("private reasoning"));
});

test("a public terminal message without an upstream id receives a stable message identity", () => {
  const raw=sse([{type:"response.completed",response:{id:"resp_no_id",status:"completed",output:[{type:"message",role:"assistant",content:[{type:"output_text",text:"ANSWER"}]}]}}]);
  const events=parsedEvents(normalizeResponsesSse(raw));
  const message=events.find(event=>event.type==="response.output_item.done").item;
  assert.match(message.id,/^msg_nd_/);
  assert.equal(message.content[0].text,"ANSWER");
  assert.equal(events.at(-1).response.output[0].id,message.id);
  assert.equal(normalizeResponsesSse(raw),normalizeResponsesSse(raw));
});

test("an empty successful upstream stream reaches the caller as a classified error without replay", async () => {
  let requests=0;const observed=[];
  const server=await listenNeuralDeepAdapter({port:0,fetchImpl:async()=>{
    requests++;
    return new Response(sse([{type:"response.completed",response:{id:"resp_empty_http",status:"completed",output:[]}}]),{headers:{"content-type":"text/event-stream"}});
  },onRequest:event=>observed.push(event)});
  try {
    const response=await fetch(`http://127.0.0.1:${server.address().port}/v1/responses`,{method:"POST",body:"{}"});
    assert.equal(response.status,502);await response.text();
    assert.equal(requests,1);
    assert.equal(observed[0].error.code,"neuraldeep_empty_response");
    assert.equal(observed[0].error.class,"outage");
  } finally {await closeNeuralDeepAdapter(server);}
});

test("rejects a truncated stream", () => {
  assert.throws(() => normalizeResponsesSse(sse([{ type: "response.created", response: { id: "resp_3" } }]).replace("data: [DONE]\n\n", "")), /without a terminal event/);
});

test("preserves a provider failure as a terminal Responses event", () => {
  const events = parsedEvents(normalizeResponsesSse(sse([
    { type: "response.created", response: { id: "resp_4", output: [] } },
    { type: "response.failed", response: { id: "resp_4", status: "failed", error: { message: "provider failure" } } },
  ])));
  assert.equal(events.at(-1).type, "response.failed");
});

test("serves a Codex-compatible empty model refresh without calling upstream", async () => {
  let upstreamCalled = false;
  const server = await listenNeuralDeepAdapter({
    port: 0,
    fetchImpl: async () => {
      upstreamCalled = true;
      throw new Error("unexpected upstream call");
    },
  });
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/models?client_version=test`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { models: [] });
    assert.equal(upstreamCalled, false);
  } finally {
    await closeNeuralDeepAdapter(server);
  }
});

test("proxies authorization and normalizes a Responses request", async () => {
  let forwardedAuthorization = null;
  const upstreamSse = sse([
    { type: "response.created", response: { id: "resp_http", output: [] } },
    {
      type: "response.completed",
      response: {
        id: "resp_http",
        status: "completed",
        output: [{
          id: "msg_http",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "OK", annotations: [] }],
        }],
      },
    },
  ]);
  const server = await listenNeuralDeepAdapter({
    port: 0,
    fetchImpl: async (_target, init) => {
      forwardedAuthorization = init.headers.get("authorization");
      return new Response(upstreamSse, { headers: { "content-type": "text/event-stream" } });
    },
  });
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/responses`, {
      method: "POST",
      headers: { authorization: "Bearer test-token", "content-type": "application/json" },
      body: JSON.stringify({ model: "test", stream: true }),
    });
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.equal(forwardedAuthorization, "Bearer test-token");
    assert.equal(parsedEvents(body).find((event) => event.type === "response.output_text.delta")?.delta, "OK");
  } finally {
    await closeNeuralDeepAdapter(server);
  }
});

test("preserves NeuralDeep auth, rate-limit and temporary failure responses", async () => {
  for (const status of [401, 403, 429, 500, 502, 503, 504]) {
    const server = await listenNeuralDeepAdapter({
      port: 0,
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: `failure-${status}` } }), {
        status,
        headers: {
          "content-type": "application/json",
          ...(status === 429 ? { "retry-after": "37" } : {}),
          "x-neuraldeep-request-id": `request-${status}`,
        },
      }),
    });
    try {
      const address = server.address();
      const response = await fetch(`http://127.0.0.1:${address.port}/v1/limits`, {
        headers: { authorization: "Bearer test-token" },
      });
      assert.equal(response.status, status);
      assert.equal(response.headers.get("x-neuraldeep-request-id"), `request-${status}`);
      if (status === 429) assert.equal(response.headers.get("retry-after"), "37");
      assert.deepEqual(await response.json(), { error: { message: `failure-${status}` } });
    } finally {
      await closeNeuralDeepAdapter(server);
    }
  }
});

test("adapter reports only classified provider errors to its host", async () => {
  const observed = [];
  const server = await listenNeuralDeepAdapter({
    port: 0,
    fetchImpl: async () => new Response(JSON.stringify({ error: { code: "insufficient_balance", message: "private provider detail" } }), {
      status: 403,
      headers: { "content-type": "application/json" },
    }),
    onRequest: (event) => observed.push(event),
  });
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/responses`, { method: "POST", body: "{}" });
    assert.equal(response.status, 403);
    assert.equal(observed[0].error.class, "billing");
    assert.equal(observed[0].error.code, "insufficient_balance");
    assert.doesNotMatch(JSON.stringify(observed[0]), /private provider detail/);
  } finally {
    await closeNeuralDeepAdapter(server);
  }
});

test("rejects an oversized request before contacting NeuralDeep", async () => {
  let upstreamCalled = false;
  const server = await listenNeuralDeepAdapter({
    port: 0,
    requestLimit: 16,
    fetchImpl: async () => {
      upstreamCalled = true;
      return new Response("unexpected");
    },
  });
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "this body is deliberately too large" }),
    });
    assert.equal(response.status, 413);
    assert.equal(upstreamCalled, false);
    assert.match((await response.json()).error.message, /exceeds 16 bytes/);
  } finally {
    await closeNeuralDeepAdapter(server);
  }
});
