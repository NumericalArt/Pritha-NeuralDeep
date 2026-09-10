import { writeFileSync, statSync } from "node:fs";
import path from "node:path";

function artifactOrder(filePath) {
  const basename = path.basename(filePath);
  const stem = path.basename(filePath, path.extname(filePath));
  const dateMatch = basename.match(/^(\d{4})-(\d{2})-(\d{2})-/);
  const revisionMatch = stem.match(/-(\d+)$/);
  let modifiedAt = 0;
  try {
    modifiedAt = statSync(filePath).mtimeMs;
  } catch {
    // Missing paths sort last; callers still perform their own existence checks.
  }
  return {
    date: dateMatch ? Number(`${dateMatch[1]}${dateMatch[2]}${dateMatch[3]}`) : 0,
    series: revisionMatch ? stem.slice(0, -revisionMatch[0].length) : stem,
    revision: revisionMatch ? Number(revisionMatch[1]) : 1,
    modifiedAt,
    basename,
  };
}

export function newestArtifactPathsFirst(paths) {
  const groups = new Map();
  for (const filePath of paths) {
    const order = artifactOrder(filePath);
    const key = `${order.date}:${order.series}`;
    if (!groups.has(key)) groups.set(key, { date: order.date, series: order.series, modifiedAt: 0, entries: [] });
    const group = groups.get(key);
    group.modifiedAt = Math.max(group.modifiedAt, order.modifiedAt);
    group.entries.push({ filePath, ...order });
  }
  return [...groups.values()]
    .sort((left, right) => (
      right.date - left.date
      || right.modifiedAt - left.modifiedAt
      || right.series.localeCompare(left.series)
    ))
    .flatMap((group) => group.entries
      .sort((left, right) => (
        right.revision - left.revision
        || right.modifiedAt - left.modifiedAt
        || right.basename.localeCompare(left.basename)
      ))
      .map((entry) => entry.filePath));
}

export function writeUniqueArtifact(filePath, render) {
  const extension = path.extname(filePath);
  const base = filePath.slice(0, -extension.length);
  for (let revision = 1; revision < 100; revision += 1) {
    const candidate = revision === 1 ? filePath : `${base}-${revision}${extension}`;
    const artifactId = path.basename(candidate, extension);
    try {
      const content = typeof render === "function" ? render({ path: candidate, artifactId, revision }) : render;
      writeFileSync(candidate, content, { flag: "wx" });
      return { path: candidate, artifactId, revision };
    } catch (error) {
      if (error?.code === "EEXIST") continue;
      throw error;
    }
  }
  throw new Error(`Could not create unique artifact for ${filePath}`);
}
