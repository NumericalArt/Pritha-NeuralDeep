// NeuralDeep currently accepts flat functions but drops Responses namespace tools.
// Translate only Pritha Search; preserve every other tool and payload field.
const namespace = "mcp__pritha_search";
const names = new Set([
  "web_search",
  "read_page",
  "research_start",
  "research_status",
  "research_cancel",
]);
const flat = (name) => `${namespace}__${name}`;
function outgoing(item) {
  if (
    item?.type === "function_call" &&
    item.namespace === namespace &&
    names.has(item.name)
  ) {
    const { namespace: _, ...rest } = item;
    return { ...rest, name: flat(item.name) };
  }
  return item;
}
function incoming(item) {
  if (item?.type !== "function_call" || typeof item.name !== "string")
    return item;
  const name = item.name.slice(namespace.length + 2);
  return item.name === flat(name) && names.has(name)
    ? { ...item, namespace, name }
    : item;
}
export function flattenSearchTools(payload) {
  if (
    !payload.tools?.some(
      (t) => t.type === "namespace" && t.name === namespace,
    ) &&
    !payload.input?.some?.((i) => i?.namespace === namespace)
  )
    return payload;
  return {
    ...payload,
    tools: payload.tools?.flatMap((t) =>
      t.type === "namespace" && t.name === namespace
        ? t.tools.map((tool) => ({ ...tool, name: flat(tool.name) }))
        : [t],
    ),
    input: Array.isArray(payload.input)
      ? payload.input.map(outgoing)
      : payload.input,
  };
}
export function restoreSearchToolsStream(raw) {
  return raw
    .split("\n")
    .map((line) => {
      if (!line.startsWith("data: ") || line.slice(6) === "[DONE]") return line;
      let event;
      try {
        event = JSON.parse(line.slice(6));
      } catch {
        return line;
      }
      if (event.item) event.item = incoming(event.item);
      if (Array.isArray(event.response?.output))
        event.response.output = event.response.output.map(incoming);
      return `data: ${JSON.stringify(event)}`;
    })
    .join("\n");
}
