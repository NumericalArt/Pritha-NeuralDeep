import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hashText } from "../../core/hash.mjs";

const MEDIA_EXTENSIONS = new Set([".aac", ".aiff", ".flac", ".m4a", ".mkv", ".mov", ".mp3", ".mp4", ".ogg", ".wav", ".webm"]);

function extensionFromUrl(url) {
  const parsed = new URL(url);
  const ext = path.extname(parsed.pathname).toLowerCase();
  return MEDIA_EXTENSIONS.has(ext) ? ext : "";
}

export const manifest = {
  id: "direct-media-url",
  version: 1,
  sourceKinds: ["remote-url"],
};

export async function canHandle(source) {
  if (source.kind !== "remote-url") return false;
  const ext = extensionFromUrl(source.url);
  if (ext) return true;
  try {
    const response = await fetch(source.url, { method: "HEAD", redirect: "follow" });
    const contentType = response.headers.get("content-type") || "";
    return response.ok && /^(audio|video)\//i.test(contentType);
  } catch {
    return false;
  }
}

export async function prepareSource(source, context) {
  const response = await fetch(source.url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Remote media download failed: ${response.status} ${response.statusText}`);
  const parsed = new URL(response.url || source.url);
  const ext = extensionFromUrl(parsed.toString()) || ".bin";
  const filename = path.basename(parsed.pathname) || "remote-media";
  const cacheDir = path.join(context.root, ".tools", "media-cache");
  mkdirSync(cacheDir, { recursive: true });
  const downloadedPath = path.join(cacheDir, `${hashText(source.url, 16)}${ext}`);
  writeFileSync(downloadedPath, Buffer.from(await response.arrayBuffer()));
  return {
    title: filename,
    creator: "unknown",
    duration: "unknown",
    sourceUrl: response.url || source.url,
    sourcePath: "",
    originalMediaPath: downloadedPath,
    originalExtension: ext,
    cleanupPaths: [downloadedPath],
    metadata: {},
  };
}
