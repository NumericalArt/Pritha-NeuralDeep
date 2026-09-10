import { existsSync, writeFileSync } from "node:fs";

export function transcribeAudio({ audioPath, transcriptJsonPath, artifactDir, model, language, tooling, run, root, force = false, mock = false }) {
  if (existsSync(transcriptJsonPath) && !force) return;
  if (mock) {
    writeFileSync(transcriptJsonPath, JSON.stringify({
      text: "Mock media transcript.",
      segments: [
        { start: 0, end: 1.2, text: "Mock media transcript." },
      ],
    }, null, 2));
    return;
  }
  run(tooling.mlxWhisper, [
    "--model",
    model,
    "--language",
    language,
    "--output-dir",
    artifactDir,
    "--output-name",
    "transcript",
    "--output-format",
    "json",
    "--verbose",
    "False",
    audioPath,
  ], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${tooling.toolBin}:${process.env.PATH}`,
    },
  });
}
