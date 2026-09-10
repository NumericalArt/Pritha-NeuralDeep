import { randomUUID } from "node:crypto";
import { clampMusicDuration, getMusicRuntimeConfig } from "./config";
import { normalizeMusicStyleKey } from "./prompt-builder";
import type { AceStepGenerateRequest, CachedGeneratedTrack, MusicGenerationJob } from "./types";
import { publicGeneratedTrack } from "./cache";

type MusicGenerationRunner = (request: MusicGenerationJob["request"]) => Promise<CachedGeneratedTrack>;

function hasPromptSpecifics(request: AceStepGenerateRequest) {
  return Boolean(
    request.prompt?.trim() ||
      request.operatorRequest?.trim() ||
      request.referenceStyle?.trim() ||
      request.referencePrompt?.trim() ||
      request.preserveCurrent,
  );
}

function nowIso() {
  return new Date().toISOString();
}

function cloneJob(job: MusicGenerationJob): MusicGenerationJob {
  return {
    ...job,
    request: { ...job.request },
    track: job.track ? { ...job.track } : undefined,
  };
}

export class MusicGenerationQueue {
  private jobs = new Map<string, MusicGenerationJob>();
  private pending: string[] = [];
  private running = false;
  private runner: MusicGenerationRunner;

  constructor(runner: MusicGenerationRunner) {
    this.runner = runner;
  }

  enqueue(request: AceStepGenerateRequest) {
    const config = getMusicRuntimeConfig();
    const normalizedStyle = normalizeMusicStyleKey(request.style || config.defaultStyle);
    const existing = this.findActiveByStyle(normalizedStyle);
    if (existing && !request.forceFresh && !hasPromptSpecifics(request)) return cloneJob(existing);

    const now = nowIso();
    const job: MusicGenerationJob = {
      id: `music_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      status: "queued",
      request: {
        ...request,
        style: request.style || config.defaultStyle,
        normalizedStyle,
        durationSec: clampMusicDuration(request.durationSec, config),
      },
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    this.pending.push(job.id);
    void this.drain().catch(() => undefined);
    return cloneJob(job);
  }

  getJob(id: string) {
    const job = this.jobs.get(id);
    return job ? cloneJob(job) : null;
  }

  activeJobs() {
    return Array.from(this.jobs.values())
      .filter((job) => job.status === "queued" || job.status === "generating")
      .map(cloneJob);
  }

  private findActiveByStyle(normalizedStyle: string) {
    return Array.from(this.jobs.values()).find(
      (job) =>
        job.request.normalizedStyle === normalizedStyle &&
        (job.status === "queued" || job.status === "generating"),
    );
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending.length) {
        const id = this.pending.shift();
        if (!id) continue;
        const job = this.jobs.get(id);
        if (!job || job.status !== "queued") continue;
        job.status = "generating";
        job.updatedAt = nowIso();
        try {
          const track = await this.runner(job.request);
          job.status = "complete";
          job.trackId = track.id;
          job.track = publicGeneratedTrack(track);
          job.updatedAt = nowIso();
        } catch (error) {
          job.status = "failed";
          job.error = error instanceof Error ? error.message : "music_generation_failed";
          job.updatedAt = nowIso();
        }
      }
    } finally {
      this.running = false;
    }
  }
}
