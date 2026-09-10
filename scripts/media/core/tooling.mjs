import { runSyncProbe } from "../../lib/sync-probe.mjs";
import { mkdirSync, existsSync } from "node:fs";
import { execFileSync as execFileSyncChild, spawnSync } from "node:child_process";
import path from "node:path";

const PYTHON = "python3";

export function run(command, args, options = {}) {
  const result = runSyncProbe(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: options.env || process.env,
    timeout: options.timeout || 0,
  });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }
  return result.stdout || "";
}

export function commandPath(command) {
  const result = spawnSync("command", ["-v", command], {
    shell: true,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

export function pythonScriptPath(command) {
  const script = `
import os
import site
import sysconfig
command = ${JSON.stringify(command)}
candidates = []
value = sysconfig.get_path("scripts")
if value:
    candidates.append(os.path.join(value, command))
try:
    candidates.append(os.path.join(site.USER_BASE, "bin", command))
except Exception:
    pass
for candidate in candidates:
    if os.path.exists(candidate):
        print(candidate)
        raise SystemExit(0)
raise SystemExit(1)
`;
  const result = spawnSync(PYTHON, ["-c", script], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : "";
}

export function imageioFfmpegPath(root) {
  if (process.env.IMAGEIO_FFMPEG_BIN) return process.env.IMAGEIO_FFMPEG_BIN;
  const output = run(PYTHON, ["-c", "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"], {
    cwd: root,
    capture: true,
  });
  return output.trim();
}

export function ensureMediaTooling(root, { mock = false } = {}) {
  if (mock) {
    return { mlxWhisper: "mock-transcriber", ffmpeg: "mock-ffmpeg", toolBin: path.join(root, ".tools", "bin") };
  }
  const mlxWhisper = process.env.MLX_WHISPER_BIN || commandPath("mlx_whisper") || pythonScriptPath("mlx_whisper");
  if (!mlxWhisper) {
    throw new Error("mlx_whisper not found. Install with: python3 -m pip install --user mlx-whisper");
  }
  const ffmpeg = imageioFfmpegPath(root);
  if (!existsSync(ffmpeg)) {
    throw new Error("imageio ffmpeg binary not found. Install with: python3 -m pip install --user imageio-ffmpeg");
  }
  const toolBin = path.join(root, ".tools", "bin");
  mkdirSync(toolBin, { recursive: true });
  const linkedFfmpeg = path.join(toolBin, "ffmpeg");
  if (!existsSync(linkedFfmpeg)) {
    execFileSyncChild("ln", ["-sf", ffmpeg, linkedFfmpeg]);
  }
  return { mlxWhisper, ffmpeg, toolBin };
}
