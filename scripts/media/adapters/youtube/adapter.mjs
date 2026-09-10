import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { hashText } from "../../core/hash.mjs";

const PYTHON = "python3";

export const manifest = {
  id: "youtube",
  version: 1,
  sourceKinds: ["remote-url"],
};

export async function canHandle(source) {
  if (source.kind !== "remote-url") return false;
  return /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/i.test(source.url);
}

function cleanToolOutput(output) {
  return String(output || "")
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith("WARNING:") && !line.startsWith("Deprecated Feature:"));
}

function getMetadata(url, context) {
  const output = context.run(PYTHON, [
    "-m",
    "yt_dlp",
    "--print",
    "%(id)s\n%(title)s\n%(channel)s\n%(duration_string)s\n%(webpage_url)s",
    url,
  ], { cwd: context.root, capture: true });
  const [id, title, creator, duration, webpageUrl] = cleanToolOutput(output).slice(-5);
  if (!id) throw new Error("Could not read media metadata.");
  return { id, title, creator, duration, webpageUrl };
}

export async function prepareSource(source, context) {
  const meta = getMetadata(source.url, context);
  const cacheDir = path.join(context.root, ".tools", "media-cache", "youtube");
  mkdirSync(cacheDir, { recursive: true });
  const downloadedPath = path.join(cacheDir, `${hashText(source.url, 16)}.mp4`);
  if (!existsSync(downloadedPath) || context.force) {
    context.run(PYTHON, [
      "-m",
      "yt_dlp",
      "--extractor-args",
      "youtube:player_client=android",
      "-f",
      "18",
      "-o",
      downloadedPath,
      source.url,
    ], { cwd: context.root });
  }
  return {
    title: meta.title,
    creator: meta.creator || "unknown",
    duration: meta.duration || "unknown",
    sourceUrl: meta.webpageUrl || source.url,
    sourcePath: "",
    originalMediaPath: downloadedPath,
    originalExtension: ".mp4",
    cleanupPaths: [downloadedPath],
    metadata: {},
  };
}
