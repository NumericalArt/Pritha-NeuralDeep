#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SearchService } from "./search/service.mjs";
import { searchToolDefinitions, callSearchTool } from "./search/tools.mjs";
import { TOOL_INSTRUCTIONS } from "./search/contracts.mjs";
let service;
try {
  const c = JSON.parse(process.env.PRITHA_SEARCH_CONTEXT || "null");
  if (
    !process.env.PRITHA_STATE_ROOT ||
    !process.env.TECHSCOPE_ROOT ||
    !c?.owner ||
    !c?.turn
  )
    throw new Error("search_context_missing");
  service = new SearchService({
    stateRoot: process.env.PRITHA_STATE_ROOT,
    codeRoot: process.env.PRITHA_SEARCH_CODE_ROOT || process.env.TECHSCOPE_ROOT,
    instance: process.env.PRITHA_INSTANCE_ID,
  });
  const controller = new AbortController();
  for (const signal of ["SIGTERM", "SIGINT"])
    process.once(signal, () => {
      controller.abort();
      server.close().finally(() => process.exit(0));
    });
  const server = new McpServer(
    { name: "pritha-search", version: "1.0.0" },
    { instructions: TOOL_INSTRUCTIONS },
  );
  for (const t of searchToolDefinitions)
    server.registerTool(
      t.name,
      {
        description: t.description,
        inputSchema: t.schema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: true,
        },
      },
      async (args, extra) => {
        const result = await callSearchTool(service, t.name, args, {
          ...c,
          signal: AbortSignal.any([controller.signal, extra.signal]),
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          isError: !result.ok,
        };
      },
    );
  await server.connect(new StdioServerTransport());
} catch {
  process.stderr.write(
    "Pritha search unavailable: check isolated runtime configuration.\n",
  );
  process.exitCode = 1;
}
