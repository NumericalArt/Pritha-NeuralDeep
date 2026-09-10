import path from "node:path";
import { lstatSync } from "node:fs";
import { readBoundedRegularFile } from "../lib/safe-file-read.mjs";

const root = process.argv[2];
if (!root || !path.isAbsolute(root)) process.exit(1);
function read(file, maxBytes) {
  const target = path.join(root, file);
  try {
    const content = readBoundedRegularFile(target, { allowedRoots: [root], maxBytes });
    const stat = lstatSync(target);
    return { status: "read", text: content.text, mtime: stat.mtime.toISOString(), mode: `0${(stat.mode & 0o777).toString(8)}` };
  } catch (error) {
    return { status: error?.code === "ENOENT" ? "missing" : "unavailable", text: "", mtime: null, mode: null };
  }
}
const source = read("operations/manifest.json", 128_000);
const manifest = { manifest: null, present: source.status !== "missing", issue: null };
if (source.status === "read") {
  try {
    const value = JSON.parse(source.text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
    manifest.manifest = value;
  } catch { manifest.issue = "operations-manifest-invalid-or-unsafe"; }
} else if (source.status === "unavailable") manifest.issue = "operations-manifest-invalid-or-unsafe";
process.stdout.write(JSON.stringify({ schema: "pritha-project-metadata-v1", manifest,
  envExample: read(".env.example", 32_000), envLocal: read(".env.local", 32_000) }));
