import { readFileSync } from "node:fs";

export function readTranscriptText(transcriptJsonPath) {
  const data = JSON.parse(readFileSync(transcriptJsonPath, "utf8"));
  return String(data.text || "").replace(/\s+/g, " ").trim();
}
