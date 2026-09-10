function parseScalar(value) {
  const trimmed = String(value ?? "").trim();
  if (trimmed === "") return "";
  if (trimmed === "[]") return [];
  if (trimmed === "{}") return Object.create(null);
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((item) => item.trim().replace(/^["']|["']$/g, ""));
  }
  return trimmed.replace(/^["']|["']$/g, "");
}

export function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return { data: {}, body: text, raw: "" };
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return { data: {}, body: text, raw: "" };

  const raw = text.slice(4, end);
  const body = text.slice(end + 5);
  const data = parseFrontmatterBlock(raw);

  return { data, body, raw };
}

export function parseFrontmatterData(text) {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return null;
  return parseFrontmatterBlock(text.slice(4, end));
}

function parseFrontmatterBlock(raw) {
  const lines = raw.split(/\r?\n/);
  const data = Object.create(null);
  let currentKey = null;
  let currentNestedKey = null;
  const forbiddenKeys = new Set(["__proto__", "constructor", "prototype"]);

  for (const line of lines) {
    if (!line.trim()) continue;

    const topMatch = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (topMatch) {
      if (forbiddenKeys.has(topMatch[1].toLowerCase())) {
        currentKey = null;
        currentNestedKey = null;
        continue;
      }
      currentKey = topMatch[1];
      currentNestedKey = null;
      data[currentKey] = parseScalar(topMatch[2] ?? "");
      continue;
    }

    const nestedMatch = line.match(/^\s{2}([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (nestedMatch && currentKey) {
      if (forbiddenKeys.has(nestedMatch[1].toLowerCase())) {
        currentNestedKey = null;
        continue;
      }
      if (!data[currentKey] || Array.isArray(data[currentKey]) || typeof data[currentKey] !== "object") {
        data[currentKey] = Object.create(null);
      }
      currentNestedKey = nestedMatch[1];
      data[currentKey][currentNestedKey] = parseScalar(nestedMatch[2] ?? "");
      continue;
    }

    const listMatch = line.match(/^\s{2,4}-\s*(.*)$/);
    if (listMatch && currentKey) {
      const value = parseScalar(listMatch[1]);
      if (currentNestedKey && data[currentKey] && typeof data[currentKey] === "object" && !Array.isArray(data[currentKey])) {
        if (!Array.isArray(data[currentKey][currentNestedKey])) data[currentKey][currentNestedKey] = [];
        data[currentKey][currentNestedKey].push(value);
      } else {
        if (!Array.isArray(data[currentKey])) data[currentKey] = [];
        data[currentKey].push(value);
      }
    }
  }

  return data;
}

export function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

export function yamlString(value) {
  if (value === undefined || value === null || value === "") return "";
  return String(value).replace(/\n/g, " ");
}

export function yamlList(values) {
  const list = unique(values);
  if (list.length === 0) return "[]";
  return `\n${list.map((item) => `  - ${yamlString(item)}`).join("\n")}`;
}

export function indentedYamlList(values, spaces = 4) {
  const list = unique(values);
  if (list.length === 0) return " []";
  const pad = " ".repeat(spaces);
  return `\n${list.map((item) => `${pad}- ${yamlString(item)}`).join("\n")}`;
}
