import test from "node:test";
import assert from "node:assert/strict";
import {
  flattenSearchTools,
  restoreSearchToolsStream,
} from "../../scripts/search/responses-bridge.mjs";
test("bridge changes only Search namespace and its history, keeping unrelated functions intact", () => {
  const other = {
    type: "function",
    name: "exec_command",
    parameters: { type: "object" },
  };
  const ns = {
    type: "namespace",
    name: "mcp__pritha_search",
    tools: [
      { type: "function", name: "web_search", parameters: { type: "object" } },
    ],
  };
  const input = {
    tools: [other, ns],
    input: [
      {
        type: "function_call",
        call_id: "x",
        namespace: "mcp__pritha_search",
        name: "web_search",
        arguments: "{}",
      },
      { type: "function_call_output", call_id: "x", output: "ok" },
    ],
  };
  const result = flattenSearchTools(input);
  assert.equal(result.tools[0], other);
  assert.equal(result.tools[1].name, "mcp__pritha_search__web_search");
  assert.equal(result.input[0].namespace, undefined);
  assert.equal(input.input[0].namespace, "mcp__pritha_search");
  assert.deepEqual(result.input[1], input.input[1]);
});
test("bridge restores complete and streamed tool identity; unrelated names are not rewritten", () => {
  const call = {
    type: "function_call",
    name: "mcp__pritha_search__read_page",
    arguments: "{}",
    call_id: "a",
  };
  const raw =
    [
      { type: "response.output_item.added", item: call },
      {
        type: "response.completed",
        response: {
          output: [call, { type: "function_call", name: "exec_command" }],
        },
      },
    ]
      .map((e) => `data: ${JSON.stringify(e)}`)
      .join("\n\n") + "\n\ndata: [DONE]\n";
  const data = restoreSearchToolsStream(raw)
    .split("\n")
    .filter((l) => l.startsWith("data: {"))
    .map((l) => JSON.parse(l.slice(6)));
  assert.equal(data[0].item.namespace, "mcp__pritha_search");
  assert.equal(data[0].item.name, "read_page");
  assert.equal(data[1].response.output[0].name, "read_page");
  assert.equal(data[1].response.output[1].name, "exec_command");
});
