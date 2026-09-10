import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createServer } from "node:http";
import { SearchStore } from "../../scripts/search/store.mjs";
test("stock MCP SDK handshake, tools and isolated search execution", async () => {
  const root = process.cwd(),
    state = mkdtempSync(path.join(os.tmpdir(), "pritha-search-mcp-"));
  const server = createServer((_, res) => {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        results: [
          {
            url: "https://example.com/doc",
            title: "MCP Source",
            content: "Synthetic fixture",
          },
        ],
      }),
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const store = new SearchStore({
    stateRoot: state,
    codeRoot: root,
    environment: {},
  });
  store.configure({enabled:false}, 1);
  const client = new Client({ name: "search-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, "scripts/search-mcp.mjs")],
    env: {
      PATH: process.env.PATH,
      TECHSCOPE_ROOT: root,
      PRITHA_STATE_ROOT: state,
      PRITHA_INSTANCE_ID: "mcp-test",
      PRITHA_SEARCH_CONTEXT: JSON.stringify({
        owner: "test",
        turn: "one",
        surface: "task_chat",
        explicit: true,
      }),
    },
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const list = await client.listTools();
    assert.deepEqual(
      list.tools.map((t) => t.name),
      [
        "web_search",
        "read_page",
        "research_start",
        "research_status",
        "research_cancel",
      ],
    );
    let r = await client.callTool({
      name: "web_search",
      arguments: { query: "first" },
    });
    assert.equal(JSON.parse(r.content[0].text).error.code, "disabled");
    store.configure(
      {
        enabled: true,
        mode: "auto",
        provider: "searxng",
        searxngUrl: `http://127.0.0.1:${port}/search`,
      },
      2,
    );
    r = await client.callTool({
      name: "web_search",
      arguments: { query: "fixture" },
    });
    const output = JSON.parse(r.content[0].text);
    assert.equal(output.ok, true);
    assert.equal(output.sources[0].url, "https://example.com/doc");
    store.configure({ enabled: false }, 3);
    r = await client.callTool({
      name: "web_search",
      arguments: { query: "off" },
    });
    assert.equal(JSON.parse(r.content[0].text).error.code, "disabled");
  } finally {
    await client.close();
    await transport.close();
    store.close();
    await new Promise((r) => server.close(r));
    rmSync(state, { recursive: true, force: true });
  }
});
