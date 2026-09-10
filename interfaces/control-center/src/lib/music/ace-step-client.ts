import { buildBackgroundMusicPrompt, findMusicPromptMismatches } from "./prompt-builder";
import { clampMusicDuration, getMusicRuntimeConfig, type MusicRuntimeConfig } from "./config";
import type { AceStepGenerateRequest, AceStepRemoteTrack } from "./types";

type AceWrapper = {
  data?: unknown;
  code?: number;
  error?: string | null;
};

type AceTaskRow = {
  task_id?: string;
  id?: string;
  status?: number;
  result?: unknown;
  error?: string;
};

type AceResultItem = {
  file?: string;
  status?: number;
  prompt?: string;
  metas?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  generation_info?: unknown;
  seed_value?: unknown;
  [key: string]: unknown;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function wrapperOk(value: AceWrapper) {
  return value.code === undefined || value.code === 200;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function parseAceTaskId(value: unknown) {
  const wrapper = value as AceWrapper;
  const data = wrapper.data as Record<string, unknown> | undefined;
  return firstString(data?.task_id, data?.id, data?.taskId, (value as Record<string, unknown>)?.task_id);
}

export function parseAceResultItems(result: unknown): AceResultItem[] {
  if (typeof result === "string") {
    try {
      const parsed = JSON.parse(result) as unknown;
      return parseAceResultItems(parsed);
    } catch {
      return [];
    }
  }
  if (Array.isArray(result)) return result.filter((item) => typeof item === "object" && item !== null) as AceResultItem[];
  if (typeof result === "object" && result !== null) return [result as AceResultItem];
  return [];
}

export function selectAceAudioItem(result: unknown) {
  return parseAceResultItems(result).find((item) => item.status === 1 && typeof item.file === "string" && item.file.trim())
    || parseAceResultItems(result).find((item) => typeof item.file === "string" && item.file.trim())
    || null;
}

export class AceStepClient {
  private config: MusicRuntimeConfig;

  constructor(config = getMusicRuntimeConfig()) {
    this.config = config;
  }

  private url(path: string) {
    if (/^https?:\/\//i.test(path)) return path;
    return `${this.config.aceStepBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  }

  private headers(contentType = "application/json") {
    const headers: Record<string, string> = {};
    if (contentType) headers["Content-Type"] = contentType;
    if (this.config.aceStepApiKey) headers.Authorization = `Bearer ${this.config.aceStepApiKey}`;
    return headers;
  }

  private async json(path: string, init: RequestInit = {}) {
    const response = await fetch(this.url(path), {
      ...init,
      headers: {
        ...this.headers(),
        ...(init.headers || {}),
      },
    });
    const payload = (await response.json().catch(() => ({}))) as AceWrapper;
    if (!response.ok || !wrapperOk(payload)) {
      throw new Error(payload.error || `ACE-Step request failed with status ${response.status}`);
    }
    return payload;
  }

  async health() {
    try {
      const response = await fetch(this.url("/health"), {
        headers: this.config.aceStepApiKey ? { Authorization: `Bearer ${this.config.aceStepApiKey}` } : undefined,
        cache: "no-store",
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels() {
    const payload = await this.json("/v1/models", { method: "GET" });
    const data = payload.data;
    if (Array.isArray(data)) {
      return data.map((item) => (typeof item === "string" ? item : firstString((item as Record<string, unknown>)?.id, (item as Record<string, unknown>)?.name))).filter(Boolean);
    }
    if (typeof data === "object" && data !== null && Array.isArray((data as { models?: unknown[] }).models)) {
      return (data as { models: unknown[] }).models.map((item) => (typeof item === "string" ? item : firstString((item as Record<string, unknown>)?.id, (item as Record<string, unknown>)?.name))).filter(Boolean);
    }
    return [];
  }

  async generateTrack(request: AceStepGenerateRequest): Promise<AceStepRemoteTrack> {
    const durationSec = clampMusicDuration(request.durationSec, this.config);
    const prompt =
      request.prompt?.trim() ||
      buildBackgroundMusicPrompt(request.style, {
        operatorRequest: request.operatorRequest,
        preserveCurrent: request.preserveCurrent,
        referenceStyle: request.referenceStyle,
        referencePrompt: request.referencePrompt,
      });
    const releasePayload = {
      prompt,
      lyrics: "",
      thinking: this.config.aceStepThinking,
      use_format: true,
      vocal_language: "en",
      audio_format: this.config.audioFormat,
      audio_duration: durationSec,
      model: this.config.aceStepModel,
      inference_steps: 8,
      batch_size: 1,
      use_random_seed: request.seed == null,
      seed: request.seed ?? -1,
      ...(request.bpm ? { bpm: request.bpm } : {}),
      ...(request.keyScale ? { key_scale: request.keyScale } : {}),
    };

    const release = await this.json("/release_task", {
      method: "POST",
      body: JSON.stringify(releasePayload),
    });
    const taskId = parseAceTaskId(release);
    if (!taskId) throw new Error("ace_step_missing_task_id");

    const started = Date.now();
    let lastError = "";
    while (Date.now() - started <= this.config.generationTimeoutMs) {
      await sleep(this.config.pollIntervalMs);
      const query = await this.json("/query_result", {
        method: "POST",
        body: JSON.stringify({ task_id_list: [taskId] }),
      });
      const rows = Array.isArray(query.data) ? (query.data as AceTaskRow[]) : [];
      const row = rows.find((item) => item.task_id === taskId || item.id === taskId) || rows[0];
      if (!row) continue;
      if (row.status === 2) throw new Error(row.error || "ace_step_generation_failed");
      if (row.status !== 1) {
        lastError = row.error || "";
        continue;
      }

      const item = selectAceAudioItem(row.result);
      if (!item?.file) throw new Error("ace_step_missing_audio_file");
      const fileUrl = item.file;
      const providerPrompt = firstString(item.prompt, "");
      const promptWarnings = findMusicPromptMismatches({
        style: request.style,
        operatorRequest: request.operatorRequest,
        sentPrompt: prompt,
        providerPrompt,
      });
      if (promptWarnings.length) {
        throw new Error(`ace_step_prompt_mismatch:${promptWarnings.join(",")}`);
      }
      const audioResponse = await fetch(this.url(fileUrl), {
        headers: this.config.aceStepApiKey ? { Authorization: `Bearer ${this.config.aceStepApiKey}` } : undefined,
      });
      if (!audioResponse.ok) throw new Error(`ace_step_audio_download_failed_${audioResponse.status}`);
      const audioBytes = new Uint8Array(await audioResponse.arrayBuffer());
      return {
        taskId,
        fileUrl,
        prompt,
        sentPrompt: prompt,
        providerPrompt,
        promptWarnings,
        durationSec,
        audioBytes,
        contentType: audioResponse.headers.get("content-type") || `audio/${this.config.audioFormat === "wav32" ? "wav" : this.config.audioFormat}`,
        metadata: {
          ...item,
          metas: item.metas || item.metadata,
        },
      };
    }

    throw new Error(lastError || "ace_step_generation_timeout");
  }
}
