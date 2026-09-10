import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { resolvePrithaStatePath } from "../../lib/paths.mjs";

export function createArtifactPaths(root, id, originalExtension = ".bin") {
  const safeExt = originalExtension && originalExtension.startsWith(".") ? originalExtension : `.${originalExtension || "bin"}`;
  const dir = resolvePrithaStatePath("queue", "media-processing", id);
  mkdirSync(dir, { recursive: true });
  return {
    dir,
    original: path.join(dir, `original${safeExt}`),
    audio: path.join(dir, "audio.wav"),
    transcriptJson: path.join(dir, "transcript.json"),
  };
}

export function cleanupArtifactPaths(artifacts) {
  if (artifacts?.dir) rmSync(artifacts.dir, { recursive: true, force: true });
}
