import path from "node:path";

export function relPath(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}
