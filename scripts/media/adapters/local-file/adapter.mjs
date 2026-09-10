import { existsSync } from "node:fs";
import path from "node:path";

export const manifest = {
  id: "local-file",
  version: 1,
  sourceKinds: ["local-file"],
};

export async function canHandle(source) {
  return source.kind === "local-file";
}

export async function prepareSource(source) {
  if (!existsSync(source.absolutePath)) {
    throw new Error(`Local media file not found: ${source.input}`);
  }
  return {
    title: path.basename(source.absolutePath),
    creator: "unknown",
    duration: "unknown",
    sourceUrl: "",
    sourcePath: source.absolutePath,
    originalMediaPath: source.absolutePath,
    originalExtension: path.extname(source.absolutePath) || ".bin",
    cleanupPaths: [],
    metadata: {},
  };
}
