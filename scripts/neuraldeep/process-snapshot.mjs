import { runSyncProbe } from "../lib/sync-probe.mjs";

// Read process ownership only. No argv, environment, usernames or credentials.
// macOS ps "sess" is zero on current hosts, so use the POSIX getsid syscall.
const PROBE = String.raw`import json, os, subprocess, sys
try:
    result = subprocess.run(['/bin/ps', '-axo', 'pid=,ppid=,pgid=,stat=,lstart='], capture_output=True, text=True, timeout=3)
except subprocess.TimeoutExpired:
    sys.exit(70)
if result.returncode != 0:
    sys.exit(71)
rows = []
for line in result.stdout.splitlines():
    parts = line.split()
    if len(parts) != 9:
        continue
    pid, parent, group = map(int, parts[:3])
    if pid == os.getpid():
        continue
    try:
        session = os.getsid(pid)
    except ProcessLookupError:
        continue
    rows.append({'pid':pid, 'parent':parent, 'group':group, 'session':session, 'state':parts[3], 'started': ' '.join(parts[4:])})
print(json.dumps(rows, separators=(',',':')))
`;

export function processSnapshot({ runProbe = runSyncProbe } = {}) {
  if (process.platform === "win32") throw new Error("process_session_unsupported");
  // A busy host can briefly miss the probe deadline. Retry the read once before
  // declaring coverage lost; no cached snapshot may authorize a signal or exit.
  let result;
  for (let attempt = 0; attempt < 2; attempt++) {
    result = runProbe("python3", ["-I", "-S", "-c", PROBE], { timeout: 4_000, maxBuffer: 4 * 1024 * 1024 });
    if (result.status === 0) break;
  }
  if (result.status !== 0) {
    throw new Error(result.status === 70 || result.error?.code === "ETIMEDOUT"
      ? "process_snapshot_timeout" : "process_snapshot_unavailable");
  }
  let rows;
  try { rows = JSON.parse(result.stdout); } catch { throw new Error("process_snapshot_unavailable"); }
  if (!Array.isArray(rows) || !rows.length || rows.length > 100_000 || rows.some(row =>
    ![row.pid,row.parent,row.group,row.session].every(value => Number.isSafeInteger(value) && value >= 0)
      || typeof row.state !== "string" || typeof row.started !== "string" || row.started.length > 80)) throw new Error("process_snapshot_invalid");
  return rows;
}

/** Reconciliation is read-only; saved identities never authorize a signal. */
export function processTreeExited(evidence, snapshot = processSnapshot()) {
  if (evidence?.version !== 1 || !Number.isSafeInteger(evidence.session) || evidence.session < 1
    || evidence.coverage === "unknown" || !Array.isArray(evidence.escaped)) return false;
  if (snapshot.some(row => row.session === evidence.session && !row.state.startsWith("Z"))) return false;
  return evidence.escaped.every(saved => Number.isSafeInteger(saved.pid) && typeof saved.started === "string"
    && !snapshot.some(row => row.pid === saved.pid && row.started === saved.started && !row.state.startsWith("Z")));
}

/** Only the executing session leader can address its own live session. */
export function signalCurrentSession(signal, { includeLeaderGroup = true } = {}) {
  if (!["SIGINT","SIGTERM","SIGKILL"].includes(signal)) throw new Error("process_signal_invalid");
  const own = processSnapshot().find(row => row.pid === process.pid);
  if (!own || own.group !== process.pid || own.session !== process.pid) throw new Error("process_session_owner_invalid");
  const groups = new Set(processSnapshot().filter(row => row.session === process.pid && row.group > 0 && (includeLeaderGroup || row.group !== process.pid)).map(row => row.group));
  for (const group of [...groups].sort((a,b) => Number(a === process.pid)-Number(b === process.pid))) {
    // Repeat the ownership check for each signal, including delayed escalation.
    // A restarted process cannot call this on a persisted session or group ID.
    const current = processSnapshot();
    if (!current.some(row => row.pid === process.pid && row.started === own.started && row.session === process.pid)) throw new Error("process_session_owner_invalid");
    if (!current.some(row => row.group === group && row.session === process.pid)) continue;
    try { process.kill(-group,signal); } catch (error) { if (error.code !== "ESRCH") throw error; }
  }
}
