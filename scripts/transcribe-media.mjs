#!/usr/bin/env node

import { copyFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { resolveTechscopeRoot } from "./lib/paths.mjs";
import { inferSourceClass } from "./lib/privacy.mjs";
import { parseSource } from "./media/core/source.mjs";
import { resolveAdapter } from "./media/core/adapter-registry.mjs";
import { createMediaId } from "./media/core/media-id.mjs";
import { cleanupArtifactPaths, createArtifactPaths } from "./media/core/artifacts.mjs";
import { extractAudio } from "./media/core/ffmpeg.mjs";
import { ensureMediaTooling, run } from "./media/core/tooling.mjs";
import { transcribeAudio } from "./media/core/transcription.mjs";
import { readTranscriptText } from "./media/core/transcript-writer.mjs";

const ROOT = resolveTechscopeRoot();
const DEFAULT_MODEL = "mlx-community/whisper-small-mlx";
const DEFAULT_LANGUAGE = "ru";

function usage() {
  console.log(`Usage:
  node scripts/transcribe-media.mjs <source> [--language ru] [--model mlx-community/whisper-small-mlx] [--force] [--json]

Outputs:
  JSON status only. Original media, extracted audio and transcript artifacts
  are created in an untracked temp workspace and deleted before exit.`);
}

function parseArgs(argv) {
  const args = {
    source: "",
    language: DEFAULT_LANGUAGE,
    model: DEFAULT_MODEL,
    force: false,
    json: false,
    help: false,
    mock: process.env.PRITHA_TRANSCRIBE_MEDIA_MOCK === "1",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--language") args.language = argv[++i];
    else if (arg === "--model") args.model = argv[++i];
    else if (arg === "--force") args.force = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (!args.source) args.source = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.help && !args.source) throw new Error("Missing media source.");
  return args;
}

async function transcribeMedia(args) {
  let sourceInfo = null;
  let artifacts = null;
  let transcriptText = "";
  const source = parseSource(args.source, { root: ROOT });
  const id = createMediaId({});
  try {
    const adaptersDir = path.join(ROOT, "scripts", "media", "adapters");
    const adapter = await resolveAdapter(source, { adaptersDir });
    const commandRunner = (command, commandArgs, options = {}) => run(command, commandArgs, {
      ...options,
      capture: args.json || options.capture,
    });
    sourceInfo = await adapter.prepareSource(source, {
      root: ROOT,
      run: commandRunner,
      force: args.force,
    });
    artifacts = createArtifactPaths(ROOT, id, sourceInfo.originalExtension);

    if (!existsSync(artifacts.original) || args.force) {
      copyFileSync(sourceInfo.originalMediaPath, artifacts.original);
    }

    const tooling = ensureMediaTooling(ROOT, { mock: args.mock });
    extractAudio({
      inputPath: artifacts.original,
      outputPath: artifacts.audio,
      tooling,
      run: commandRunner,
      root: ROOT,
      force: args.force,
      mock: args.mock,
    });
    transcribeAudio({
      audioPath: artifacts.audio,
      transcriptJsonPath: artifacts.transcriptJson,
      artifactDir: artifacts.dir,
      model: args.model,
      language: args.language,
      tooling,
      run: commandRunner,
      root: ROOT,
      force: args.force,
      mock: args.mock,
    });
    transcriptText = readTranscriptText(artifacts.transcriptJson);
  } finally {
    if (artifacts) cleanupArtifactPaths(artifacts);
    for (const cleanupPath of sourceInfo?.cleanupPaths || []) {
      rmSync(cleanupPath, { force: true, recursive: true });
    }
  }

  const processedAt = new Date().toISOString();
  const sourceClass = inferSourceClass({
    relPath: "",
    text: `${source.kind} ${sourceInfo?.originalExtension || ""}`,
    data: {},
  });
  return {
    id,
    anonymous_source_id: id,
    source_class: sourceClass,
    processed_at: processedAt,
    retention_status: "source-purged",
    usefulness: "medium",
    evidence_quality: "uncertain",
    transcription: {
      language: args.language,
      model: args.model,
      text_chars: transcriptText.length,
      retained: false,
    },
    deletion: {
      temp_workspace_purged: true,
      original_media_purged: true,
      extracted_audio_purged: true,
      transcript_json_purged: true,
      transcript_text_purged: true,
      source_payload_persisted: false,
    },
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }
  const result = await transcribeMedia(args);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("Media processed.");
    console.log(`Anonymous source: ${result.anonymous_source_id}`);
    console.log(`Source class: ${result.source_class}`);
    console.log(`Retention: ${result.retention_status}`);
    console.log("Raw media/audio/transcript artifacts purged.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  usage();
  process.exit(1);
}
