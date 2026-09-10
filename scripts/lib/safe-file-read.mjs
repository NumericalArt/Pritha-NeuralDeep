import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs";
import path from "node:path";

function pathInside(candidate, root) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

export function readBoundedRegularFile(filePath, options = {}) {
  const maxBytes = Math.max(1, Math.min(Number(options.maxBytes || 2_000_000), 20_000_000));
  const requestedPath = path.resolve(String(filePath || ""));
  const requestedStat = lstatSync(requestedPath);
  if (!requestedStat.isFile() || requestedStat.isSymbolicLink()) throw new Error("file_must_be_regular_and_not_symlink");
  const realPath = realpathSync(requestedPath);
  const allowedRoots = (options.allowedRoots || []).map((root) => realpathSync(path.resolve(root)));
  if (allowedRoots.length && !allowedRoots.some((root) => pathInside(realPath, root))) throw new Error("file_outside_allowed_roots");

  const noFollow = constants.O_NOFOLLOW || 0;
  const nonBlock = constants.O_NONBLOCK || 0;
  const fd = openSync(realPath, constants.O_RDONLY | noFollow | nonBlock);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error("file_must_be_regular");
    if (stat.size > maxBytes) throw new Error("file_size_limit_exceeded");
    const buffer = Buffer.alloc(maxBytes + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const count = readSync(fd, buffer, offset, buffer.length - offset, offset);
      if (count === 0) break;
      offset += count;
    }
    if (offset > maxBytes) throw new Error("file_size_limit_exceeded");
    return {
      path: realPath,
      buffer: buffer.subarray(0, offset),
      text: buffer.subarray(0, offset).toString(options.encoding || "utf8"),
      size: offset,
    };
  } finally {
    closeSync(fd);
  }
}
