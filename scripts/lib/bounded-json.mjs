const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function boundedJsonReason(value, options = {}) {
  const maxDepth = Math.max(1, Math.min(Number(options.maxDepth || 24), 64));
  const maxNodes = Math.max(1, Math.min(Number(options.maxNodes || 20_000), 100_000));
  const maxArrayLength = Math.max(1, Math.min(Number(options.maxArrayLength || 2_000), 20_000));
  const maxObjectKeys = Math.max(1, Math.min(Number(options.maxObjectKeys || 500), 5_000));
  const maxStringLength = Math.max(1, Math.min(Number(options.maxStringLength || 100_000), 1_000_000));
  const stack = [{ value, depth: 0 }];
  let nodes = 0;

  while (stack.length) {
    const current = stack.pop();
    nodes += 1;
    if (nodes > maxNodes) return "json_node_limit_exceeded";
    if (current.depth > maxDepth) return "json_depth_limit_exceeded";
    const item = current.value;
    if (item === null || typeof item === "boolean") continue;
    if (typeof item === "string") {
      if (item.length > maxStringLength) return "json_string_limit_exceeded";
      continue;
    }
    if (typeof item === "number") {
      if (!Number.isFinite(item)) return "json_number_invalid";
      continue;
    }
    if (Array.isArray(item)) {
      if (item.length > maxArrayLength) return "json_array_limit_exceeded";
      for (const child of item) stack.push({ value: child, depth: current.depth + 1 });
      continue;
    }
    if (typeof item === "object") {
      const keys = Object.keys(item);
      if (keys.length > maxObjectKeys) return "json_object_key_limit_exceeded";
      if (keys.some((key) => FORBIDDEN_KEYS.has(key))) return "json_forbidden_key";
      for (const key of keys) stack.push({ value: item[key], depth: current.depth + 1 });
      continue;
    }
    return "json_value_type_invalid";
  }
  return "";
}

export function parseBoundedJson(text, options = {}) {
  const source = String(text || "");
  const maxBytes = Math.max(1, Math.min(Number(options.maxBytes || 1_000_000), 5_000_000));
  if (Buffer.byteLength(source, "utf8") > maxBytes) throw new Error("json_byte_limit_exceeded");
  const value = JSON.parse(source);
  const reason = boundedJsonReason(value, options);
  if (reason) throw new Error(reason);
  return value;
}
