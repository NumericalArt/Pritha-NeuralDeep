import { runSyncProbe } from "./sync-probe.mjs";

// Advisory only: do not re-lint historical commits after they reach main.
export function commitMessageWarnings(root, base = "origin/main") {
  const git = args => runSyncProbe("git", args, { cwd: root, timeout: 5000, maxBuffer: 1_048_576 });
  if (!/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(base)) return ["Commit message audit: invalid base reference."];
  const merged = git(["merge-base", "HEAD", base]);
  const sha = String(merged.stdout || "").trim();
  if (merged.status !== 0 || !/^[a-f0-9]{40,64}$/.test(sha)) return ["Commit message audit: comparison base unavailable."];
  const result = git(["log", "--format=%h%x09%s", `${sha}..HEAD`]);
  if (result.status !== 0) return ["Commit message audit: history unavailable."];
  const invalid = String(result.stdout || "").trim().split("\n").filter(Boolean).filter(line => {
    const title = line.slice(line.indexOf("\t") + 1);
    return !/^(?:feat|fix|docs|refactor|test|chore|build|ci|perf|style|revert)(?:\([^()\r\n]+\))?!?: .+/.test(title)
      && !/^(?:Merge |Revert ")/.test(title);
  }).map(line => line.split("\t")[0]);
  return invalid.length ? [`Conventional commit prefix missing: ${invalid.join(", ")}.`] : [];
}
