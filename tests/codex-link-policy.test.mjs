import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";
test("local Markdown links cannot become HTTP filesystem routes", async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pritha-link-policy-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "policy.mjs");
  writeFileSync(file, ts.transpileModule(readFileSync("interfaces/control-center/src/components/codex/link-policy.ts", "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
  const { markdownLink } = await import(pathToFileURL(file).href);
  for (const input of ["/Users/operator/child/README.md", "</private/state/Outcome Spec.md>", "../state/handoff.md", "file:///etc/passwd", "//external.invalid/path", "/agents/../../etc/passwd"]) assert.deepEqual(markdownLink(input), { href: null, local: true });
  for (const input of ["/agents?id=fixture", "#checks", "https://example.org/docs"]) assert.equal(markdownLink(input).href, input);
  for (const input of ["javascript:alert(1)", "data:text/html,unsafe", "https://name:password@example.org"]) assert.equal(markdownLink(input).href, null);
});
