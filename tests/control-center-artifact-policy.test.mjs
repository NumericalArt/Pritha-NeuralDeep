import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtimeSource = readFileSync("interfaces/control-center/src/lib/realtime/pritha-runtime.ts", "utf8");

function readArtifactSource() {
  const start = runtimeSource.indexOf("async function readArtifact");
  const end = runtimeSource.indexOf("function cappedLimit", start);
  assert.notEqual(start, -1, "readArtifact should exist");
  assert.notEqual(end, -1, "readArtifact boundary should be stable");
  return runtimeSource.slice(start, end);
}

test("readArtifact blocks excluded secret-like paths before file reads", () => {
  const source = readArtifactSource();
  const exclusionIndex = source.indexOf("isExcludedSecretPath(fullPath)");
  const existsIndex = source.indexOf("existsSync(fullPath)");
  const readIndex = source.indexOf('readFile(fullPath, "utf8")');

  assert.notEqual(exclusionIndex, -1, "readArtifact should check the secret-path denylist");
  assert.notEqual(existsIndex, -1, "readArtifact should keep artifact existence handling");
  assert.notEqual(readIndex, -1, "readArtifact should keep artifact reading");
  assert.ok(exclusionIndex < existsIndex, "denylist check should happen before existence probing");
  assert.ok(exclusionIndex < readIndex, "denylist check should happen before readFile");
  assert.match(source, /error: "path_excluded"/);
});

test("readArtifact denylist reuses filesystem secret patterns", () => {
  assert.match(runtimeSource, /function isExcludedSecretPath/);
  assert.match(runtimeSource, /FILESYSTEM_EXCLUDED_NAMES\.has/);
  assert.match(runtimeSource, /FILESYSTEM_EXCLUDED_FILE_PATTERNS\.some/);
  assert.match(runtimeSource, /\^\\\.env/);
  assert.match(runtimeSource, /credential/i);
  assert.match(runtimeSource, /secret/i);
  assert.match(runtimeSource, /token/i);
  assert.match(runtimeSource, /password/i);
});
