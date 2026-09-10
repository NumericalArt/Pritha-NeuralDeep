import { copyFileSync, existsSync } from "node:fs";

export function extractAudio({ inputPath, outputPath, tooling, run, root, force = false, mock = false }) {
  if (existsSync(outputPath) && !force) return;
  if (mock) {
    copyFileSync(inputPath, outputPath);
    return;
  }
  run(tooling.ffmpeg, [
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    outputPath,
  ], { cwd: root });
}
