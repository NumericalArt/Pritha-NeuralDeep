import { readFileSync } from "node:fs";

const templates = new Map();

// Only authored URL literals call this renderer. Values are substituted once;
// JavaScript and placeholder-looking text supplied by a contract stay literal.
export function renderScaffoldTemplate(url, values = {}) {
  const key = url.href;
  if (!templates.has(key)) templates.set(key, readFileSync(url, "utf8"));
  return templates.get(key).replace(/\{\{pritha:([A-Za-z][A-Za-z0-9_]*)\}\}/g, (_token, name) => {
    if (!Object.hasOwn(values, name)) throw new Error(`Missing scaffold template value: ${name}`);
    return `${values[name]}`;
  });
}
