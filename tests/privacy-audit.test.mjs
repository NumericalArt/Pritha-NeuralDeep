import test from "node:test";
import assert from "node:assert/strict";
import { containsForbiddenText, isForbiddenRawPath } from "../scripts/lib/privacy.mjs";

test("privacy helpers detect forbidden raw artifacts and incoming provenance", () => {
  assert.equal(isForbiddenRawPath("01_sources/raw/media/source/original.mp4"), true);
  assert.equal(isForbiddenRawPath("01_sources/raw/.gitkeep"), false);

  const findings = containsForbiddenText("00_inbox/telegram/example.md", [
    "source_url: https://example.invalid/raw",
    "Raw update: `01_sources/raw/telegram/update.json`",
    "chat_id: 123456789",
    "# Media Transcript: original title",
    "transcript.md",
  ].join("\n"));

  assert.ok(findings.some((finding) => finding.id === "source-url-field"));
  assert.ok(findings.some((finding) => finding.id === "raw-update"));
  assert.ok(findings.some((finding) => finding.id === "telegram-identifiers"));
  assert.ok(findings.some((finding) => finding.id === "media-transcript"));
  assert.ok(findings.some((finding) => finding.id === "transcript-artifact"));
  assert.ok(findings.some((finding) => finding.id === "incoming-url"));
});

test("privacy helpers keep official reference URLs outside incoming artifacts", () => {
  const findings = containsForbiddenText("04_standards/example.md", "See https://docs.example.invalid/reference for stable docs.");
  assert.deepEqual(findings, []);
});

test("privacy helpers detect live Telegram tokens in any tracked Markdown", () => {
  const findings = containsForbiddenText(
    "11_agents/reports/example.md",
    "TELEGRAM_BOT_TOKEN=123456789:AAEabcdefghijklmnopqrstuvwxyz123456",
  );
  assert.ok(findings.some((finding) => finding.id === "live-telegram-token"));
});
