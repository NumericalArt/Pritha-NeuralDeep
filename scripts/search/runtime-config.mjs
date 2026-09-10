import path from "node:path";
export function searchMcpConfig(root) {
  return [
    "[mcp_servers.pritha_search]",
    `command = ${JSON.stringify(process.execPath)}`,
    `args = [${JSON.stringify(path.join(root, "scripts", "search-mcp.mjs"))}]`,
    "required = false",
    "startup_timeout_sec = 10",
    "tool_timeout_sec = 35",
    'env_vars = ["PRITHA_STATE_ROOT", "TECHSCOPE_ROOT", "PRITHA_SEARCH_CODE_ROOT", "PRITHA_INSTANCE_ID", "PRITHA_SEARCH_CONTEXT", "PRITHA_NEURALDEEP_KEYCHAIN_SERVICE", "PRITHA_NEURALDEEP_API_KEY", "NEURALDEEP_API_KEY", "PRITHA_CONTROL_CENTER_PORT"]',
    "",
  ].join("\n");
}
export function searchMcpArgs(root) {
  return [
    "-c",
    `mcp_servers.pritha_search.command=${JSON.stringify(process.execPath)}`,
    "-c",
    `mcp_servers.pritha_search.args=${JSON.stringify([path.join(root, "scripts", "search-mcp.mjs")])}`,
    "-c",
    "mcp_servers.pritha_search.required=false",
    "-c",
    "mcp_servers.pritha_search.startup_timeout_sec=10",
    "-c",
    "mcp_servers.pritha_search.tool_timeout_sec=35",
    "-c",
    `mcp_servers.pritha_search.env_vars=${JSON.stringify(["PRITHA_STATE_ROOT", "TECHSCOPE_ROOT", "PRITHA_SEARCH_CODE_ROOT", "PRITHA_INSTANCE_ID", "PRITHA_SEARCH_CONTEXT", "PRITHA_NEURALDEEP_KEYCHAIN_SERVICE", "PRITHA_NEURALDEEP_API_KEY", "NEURALDEEP_API_KEY", "PRITHA_CONTROL_CENTER_PORT"])}`,
  ];
}
export function searchRuntimeContext(options, runId) {
  const surface = options.usageSource === "child-agent" ? "child" : "task_chat";
  let intent = {};
  try {
    intent = JSON.parse(process.env.PRITHA_SEARCH_INTENT || "{}");
  } catch {}
  return {
    surface,
    model: options.model,
    researchExplicit: intent.researchExplicit === true,
    owner: String(
      process.env.PRITHA_SEARCH_OWNER ||
        options.workloadId ||
        options.resume ||
        runId,
    ),
    turn: String(process.env.PRITHA_SEARCH_TURN || runId),
    explicit: intent.explicit === true || intent.researchExplicit === true,
  };
}
