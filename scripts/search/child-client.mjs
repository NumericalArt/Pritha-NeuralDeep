import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { randomUUID } from "node:crypto";
import path from "node:path";
export function createChildSearchAdapter({
  codeRoot,
  stateRoot,
  instance,
  owner,
  allowedHosts,
  keychainService,
}) {
  if (
    !path.isAbsolute(codeRoot || "") ||
    !path.isAbsolute(stateRoot || "") ||
    !owner
  )
    throw Error("shared_search_configuration_required");
  const turns = new WeakMap();
  async function call(name, args, signal) {
    if (!signal) throw Error("child_search_turn_required");
    let turn = turns.get(signal);
    if (!turn) {
      turn = `child_${randomUUID()}`;
      turns.set(signal, turn);
    }
    signal.throwIfAborted();
    const client = new Client({ name: owner, version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(codeRoot, "scripts/search-mcp.mjs")],
      env: {
        PATH: process.env.PATH,
        TECHSCOPE_ROOT: codeRoot,
        PRITHA_STATE_ROOT: stateRoot,
        PRITHA_INSTANCE_ID: instance || "pritha",
        PRITHA_SEARCH_CONTEXT: JSON.stringify({
          owner,
          turn,
          surface: "child",
          explicit: true,
          allowedHosts,
        }),
        ...(keychainService
          ? { PRITHA_NEURALDEEP_KEYCHAIN_SERVICE: keychainService }
          : {}),
      },
      stderr: "pipe",
    });
    try {
      await client.connect(transport);
      const r = await client.callTool({ name, arguments: args }, undefined, {
        signal,
        timeout: 30000,
      });
      const out = JSON.parse(r.content.find((c) => c.type === "text").text);
      if (!out.ok) throw Error(out.error?.code || "search_failed");
      return out;
    } finally {
      await client.close();
      await transport.close();
    }
  }
  return {
    async search(topic, signal) {
      const r = await call(
        "web_search",
        { query: topic, max_results: 8 },
        signal,
      );
      return r.sources.map((s) => ({
        url: s.url,
        title: s.title,
        snippet: s.snippet,
      }));
    },
    async read(url, signal) {
      const r = await call("read_page", { url, max_chars: 18000 }, signal);
      const s = r.sources[0];
      if (!s) throw Error("source_unavailable");
      return { url: s.url, text: s.text };
    },
  };
}
