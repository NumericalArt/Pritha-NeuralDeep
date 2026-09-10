import test from "node:test";
import assert from "node:assert/strict";
import { slug, transliterate } from "../scripts/lib/slug.mjs";

test("transliterate maps Cyrillic for ASCII ids", () => {
  assert.equal(transliterate("Притха агент"), "Pritha agent");
  assert.equal(slug("Funny Teacher"), "funny-teacher");
  assert.equal(slug("Притха агент"), "pritha-agent");
});

test("slug can preserve Cyrillic for legacy filenames", () => {
  assert.equal(slug("https://example.com/Тест и Codex!", {
    stripUrls: true,
    allowCyrillic: true,
    maxLength: 80,
    fallback: "item",
  }), "example-com-тест-и-codex");
});

test("slug fallback is explicit", () => {
  assert.equal(slug("!!!", { fallback: "agent" }), "agent");
});
