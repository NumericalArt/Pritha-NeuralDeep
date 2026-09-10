import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { generatedAgentFiles } from "../scripts/agents-mother/scaffold/index.mjs";
import { renderScaffoldTemplate } from "../scripts/agents-mother/scaffold/template.mjs";
import { scaffoldTemplateCases } from "./helpers/scaffold-template-fixtures.mjs";

// Captured before template extraction. Update individual hashes only after
// reviewing an intentional change to generated child-agent behavior.
const snapshot = JSON.parse(readFileSync(new URL("./snapshots/scaffold-template-hashes.json", import.meta.url), "utf8"));
for (const [name, data] of scaffoldTemplateCases()) {
  test(`extracted scaffold templates preserve ${name} output bytes`, t => {
    // CLI workflow frontmatter contains today's date. Freeze the capture date
    // so the byte-equivalence check does not fail at midnight.
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-08T00:00:00.000Z") });
    const files = generatedAgentFiles(data, { voiceCopyTarget: "sibling:template-fixture" });
    assert.deepEqual(files.map(({ path, content }) => ({
      path, bytes: Buffer.byteLength(content), sha256: createHash("sha256").update(content).digest("hex"),
    })).sort((a, b) => a.path.localeCompare(b.path)), snapshot.cases[name]);
  });
}

test("template values remain literal and required slots fail visibly", t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-template-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const url = pathToFileURL(path.join(root, "fixture.tmpl"));
  writeFileSync(url, "Hello {{pritha:name}} / {{pritha:other}}\n");
  const literal = "${process.exit(1)} {{pritha:other}} `quotes` $&";
  assert.equal(renderScaffoldTemplate(url, { name: literal, other: "end" }), `Hello ${literal} / end\n`);
  assert.throws(() => renderScaffoldTemplate(url, { name: "incomplete" }), /Missing scaffold template value: other/);
  assert.throws(() => renderScaffoldTemplate(url, Object.create({ name: "inherited", other: "inherited" })), /Missing scaffold template value: name/);
});
