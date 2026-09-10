"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  computeMusicDucking,
  computeMusicOutputGain,
  MAX_MUSIC_USER_VOLUME,
  musicControlVolumeArgToUserVolume,
  musicDuckingGainToElementVolumeRatio,
  musicSourceCapabilities,
  musicUserVolumeToElementVolume,
  musicUserVolumeToPercent,
  normalizeMusicUserVolume,
  type MusicMode,
} from "../../lib/music/volume";

type MusicSource = "somafm" | "library" | "ace-step";
type MusicGenerationStatus = "idle" | "queued" | "generating" | "failed";

type PublicGeneratedTrack = {
  id: string;
  style: string;
  normalizedStyle: string;
  prompt: string;
  operatorRequest?: string;
  sentPrompt?: string;
  providerPrompt?: string;
  promptWarnings?: string[];
  promptMismatch?: boolean;
  localUrl: string;
  durationSec: number;
  createdAt: string;
  aceTaskId: string;
  aceFileUrl: string;
  audioFormat: string;
  sizeBytes: number;
  seed?: number;
  metadata?: Record<string, unknown>;
};

type LocalMusicTrack = {
  id: string;
  title: string;
  fileName: string;
  relativePath: string;
  url: string;
  audioFormat: string;
  sizeBytes: number;
  updatedAt: string;
};

type MusicSourceSettings = {
  defaultSource: MusicSource;
  somafm: {
    defaultChannelId: string;
  };
  library: {
    repeatMode: "off" | "all";
  };
  aceStep: {
    defaultStyle: string;
  };
};

type SomaFmPlaybackPayload = {
  ok?: boolean;
  channel?: {
    id: string;
    title: string;
    genre?: string;
    description?: string;
    lastPlaying?: string;
  };
  playlist?: {
    url: string;
    format: string;
    quality: string;
  };
  playbackUrl?: string;
  candidateUrls?: string[];
  source?: string;
  error?: string;
};

type SomaFmChannelsPayload = {
  ok?: boolean;
  channels?: Array<{
    id: string;
    title: string;
    genre?: string;
    description?: string;
    listeners?: number | null;
    lastPlaying?: string;
  }>;
  error?: string;
};

type MusicControlArgs = {
  action?: unknown;
  source?: unknown;
  style?: unknown;
  operator_request?: unknown;
  preserve_current?: unknown;
  volume?: unknown;
  mode?: unknown;
  channel_id?: unknown;
  query?: unknown;
  direction?: unknown;
  repeat?: unknown;
};

type PlayableMusicItem = {
  source: MusicSource;
  id: string;
  title: string;
  audioUrl: string;
  streamKind: "direct" | "playlist" | "generated" | "local" | "decoded-radio";
  candidateUrls?: string[];
  metadata?: Record<string, unknown>;
};

type MusicSlot = {
  audio: HTMLAudioElement;
  mediaSource?: MediaElementAudioSourceNode;
  sourceGain?: GainNode;
  duckingGain?: GainNode;
  analyser?: AnalyserNode;
  analyserData?: Float32Array<ArrayBuffer>;
  item?: PlayableMusicItem;
  sourceVolumeTimer?: number | null;
  duckingTimer?: number | null;
  sourceVolumeValue: number;
  duckingGainValue: number;
};

type DecodedMp3AudioData = {
  channelData?: Float32Array[];
  sampleRate?: number;
};

type StreamingMp3Decoder = {
  decode(data: Uint8Array): DecodedMp3AudioData;
  flush?: () => DecodedMp3AudioData;
  free: () => void;
};

type DecodedSomaFmStream = {
  item: PlayableMusicItem;
  sourceUrl: string;
  abortController: AbortController;
  decoder?: StreamingMp3Decoder;
  sourceGain: GainNode;
  duckingGain: GainNode;
  analyser: AnalyserNode;
  analyserData: Float32Array<ArrayBuffer>;
  scheduledTime: number;
  sourceVolumeTimer: number | null;
  duckingTimer: number | null;
  sourceVolumeValue: number;
  duckingGainValue: number;
  chunksDecoded: number;
  buffersScheduled: number;
  samplesScheduled: number;
  active: boolean;
  startedAt: number;
};

type CodexTaskLike = {
  status: string;
};

const DUCK_ATTACK_SEC = 0.35;
const MANUAL_VOLUME_RAMP_SEC = 0.12;
const MANUAL_VOLUME_RELEASE_DELAY_MS = 250;
const MANUAL_VOLUME_RELEASE_SEC = 0.35;
const USER_SPEECH_FALLBACK_STOP_MS = 4500;
const RELEASE_DELAY_MS = 650;
const RELEASE_TIME_SEC = 1.8;
const FADE_OUT_SEC = 0.4;
const CROSSFADE_SEC = 2;
const ASSISTANT_SPEECH_RMS_THRESHOLD = 0.012;
const ASSISTANT_SPEECH_HANGOVER_MS = 300;
const DEFAULT_STYLE = "calm organ ambient instrumental background music";
const DEFAULT_SOMAFM_CHANNEL_ID = "groovesalad";
const STREAM_PLAY_START_TIMEOUT_MS = 2500;
const SOMAFM_DECODE_BUFFER_LEAD_SEC = 0.45;
const SOMAFM_DECODE_UNDERRUN_LEAD_SEC = 0.08;

async function resumeAudioContextIfNeeded(context: AudioContext | null) {
  if (!context) return;
  if (context.state === "running" || context.state === "closed") return;
  await context.resume().catch(() => undefined);
}

function normalizeStyle(value: unknown) {
  return String(value || DEFAULT_STYLE).replace(/\s+/g, " ").trim().slice(0, 180) || DEFAULT_STYLE;
}

function normalizeOperatorRequest(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 900);
}

function wantsPreserveCurrent(value: unknown) {
  return /\b(keep|preserve|same|as\s+is|only\s+change|leave)\b|(?:оставь|сохрани|как есть|только\s+убрать|только\s+изменить)/iu.test(
    String(value || ""),
  );
}

function generatedReferenceFromItem(item?: PlayableMusicItem | null) {
  if (!item || item.source !== "ace-step") return {};
  return {
    referenceStyle: item.title,
    referencePrompt: typeof item.metadata?.prompt === "string" ? item.metadata.prompt : "",
  };
}

function normalizeMusicSource(value: unknown, fallback: MusicSource = "somafm"): MusicSource {
  return value === "somafm" || value === "library" || value === "ace-step" ? value : fallback;
}

function normalizeChannelId(value: unknown) {
  return String(value || "").replace(/[^A-Za-z0-9_-]/g, "");
}

function makeMusicAudioElement() {
  const audio = new Audio();
  audio.crossOrigin = "anonymous";
  audio.preload = "auto";
  audio.setAttribute("playsinline", "true");
  audio.setAttribute("webkit-playsinline", "true");
  audio.volume = 1;
  return audio;
}

function compactAudioSrc(value: string) {
  if (!value) return "";
  if (value.startsWith("/api/")) return value.split("?")[0] || value;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.slice(0, 160);
  }
}

function sampleAnalyserRms(analyser: AnalyserNode | undefined, analyserData: Float32Array<ArrayBuffer> | undefined) {
  if (!analyser || !analyserData) return null;
  analyser.getFloatTimeDomainData(analyserData);
  let sum = 0;
  for (let index = 0; index < analyserData.length; index += 1) {
    const value = analyserData[index] || 0;
    sum += value * value;
  }
  return Number(Math.sqrt(sum / analyserData.length).toFixed(6));
}

function sampleSlotGraphRms(slot: MusicSlot | undefined) {
  return sampleAnalyserRms(slot?.analyser, slot?.analyserData);
}

function musicSlotDiagnostics(slot: MusicSlot | undefined) {
  if (!slot) {
    return {
      slot_has_audio: false,
      slot_graph_rms: null,
      slot_audio_volume: null,
      slot_audio_muted: null,
      slot_source_gain: null,
      slot_ducking_gain: null,
      slot_ready_state: null,
      slot_network_state: null,
      slot_stream_kind: null,
      slot_item_source: null,
      slot_item_id: null,
      slot_src: "",
    };
  }
  return {
    slot_has_audio: Boolean(slot.audio.src),
    slot_graph_rms: sampleSlotGraphRms(slot),
    slot_audio_volume: Number(slot.audio.volume.toFixed(4)),
    slot_audio_muted: slot.audio.muted,
    slot_source_gain: slot.sourceGain ? Number(slot.sourceGain.gain.value.toFixed(4)) : null,
    slot_ducking_gain: slot.duckingGain ? Number(slot.duckingGain.gain.value.toFixed(4)) : null,
    slot_ready_state: slot.audio.readyState,
    slot_network_state: slot.audio.networkState,
    slot_stream_kind: slot.item?.streamKind || null,
    slot_item_source: slot.item?.source || null,
    slot_item_id: slot.item?.id || null,
    slot_src: compactAudioSrc(slot.audio.currentSrc || slot.audio.src),
  };
}

function decodedSomaFmDiagnostics(stream: DecodedSomaFmStream | null | undefined) {
  if (!stream) {
    return {
      decoded_stream_active: false,
      decoded_graph_rms: null,
      decoded_source_gain: null,
      decoded_ducking_gain: null,
      decoded_buffers_scheduled: null,
      decoded_chunks: null,
      decoded_samples: null,
      decoded_lead_sec: null,
      decoded_src: "",
    };
  }
  const leadSec = Math.max(0, stream.scheduledTime - stream.sourceGain.context.currentTime);
  return {
    decoded_stream_active: stream.active,
    decoded_graph_rms: sampleAnalyserRms(stream.analyser, stream.analyserData),
    decoded_source_gain: Number(stream.sourceGain.gain.value.toFixed(4)),
    decoded_ducking_gain: Number(stream.duckingGain.gain.value.toFixed(4)),
    decoded_buffers_scheduled: stream.buffersScheduled,
    decoded_chunks: stream.chunksDecoded,
    decoded_samples: stream.samplesScheduled,
    decoded_lead_sec: Number(leadSec.toFixed(3)),
    decoded_src: compactAudioSrc(stream.sourceUrl),
  };
}

function activeMusicSource(state: VoiceMusicState) {
  return state.currentItem?.source || state.source;
}

function taskIsBusy(task: CodexTaskLike) {
  const status = String(task.status || "").toLowerCase();
  if (!status) return false;
  if (status === "queued" || status === "running") return true;
  if (status === "decision_required" || status === "waiting_for_operator") return false;
  if (status === "complete" || status === "rejected" || status.startsWith("failed")) return false;
  return true;
}

function publicTrackFromPayload(value: unknown): PublicGeneratedTrack | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const track = value as Partial<PublicGeneratedTrack>;
  if (!track.id || !track.localUrl) return undefined;
  return track as PublicGeneratedTrack;
}

function itemFromGeneratedTrack(track: PublicGeneratedTrack): PlayableMusicItem {
  return {
    source: "ace-step",
    id: track.id,
    title: track.style,
    audioUrl: track.localUrl,
    streamKind: "generated",
    metadata: {
      prompt: track.prompt,
      durationSec: track.durationSec,
      aceTaskId: track.aceTaskId,
      audioFormat: track.audioFormat,
    },
  };
}

function itemFromLocalTrack(track: LocalMusicTrack): PlayableMusicItem {
  return {
    source: "library",
    id: track.id,
    title: track.title,
    audioUrl: track.url,
    streamKind: "local",
    metadata: {
      fileName: track.fileName,
      relativePath: track.relativePath,
      audioFormat: track.audioFormat,
      sizeBytes: track.sizeBytes,
    },
  };
}

function itemFromSomaFmPlayback(payload: SomaFmPlaybackPayload): PlayableMusicItem | null {
  if (!payload.ok || !payload.channel?.id || !payload.playbackUrl) return null;
  const playlistUrl = payload.playlist?.url;
  const candidates = [
    payload.playbackUrl,
    ...(payload.candidateUrls || []),
    ...(playlistUrl ? [playlistUrl] : []),
  ].filter((url, index, rows) => /^https?:\/\//i.test(url) && rows.indexOf(url) === index);
  return {
    source: "somafm",
    id: payload.channel.id,
    title: payload.channel.title || payload.channel.id,
    audioUrl: payload.playbackUrl,
    streamKind: payload.source === "resolved" ? "direct" : "playlist",
    candidateUrls: candidates,
    metadata: {
      genre: payload.channel.genre,
      description: payload.channel.description,
      lastPlaying: payload.channel.lastPlaying,
      playlist: payload.playlist,
    },
  };
}

async function playWithTimeout(audio: HTMLAudioElement, timeoutMs: number) {
  let timer: number | null = null;
  try {
    await Promise.race([
      audio.play(),
      new Promise((_, reject) => {
        timer = window.setTimeout(() => reject(new Error("music_playback_start_timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== null) window.clearTimeout(timer);
  }
}

export type VoiceMusicState = {
  controlEnabled: boolean;
  mode: MusicMode;
  source: MusicSource;
  desiredStyle: string;
  userVolume: number;
  generationStatus: MusicGenerationStatus;
  currentItem?: PlayableMusicItem;
  isPlaying: boolean;
  assistantSpeaking: boolean;
  userSpeaking: boolean;
  agentBusy: boolean;
  error?: string;
};

export function useVoiceMusicController({
  codexTasks,
  logClientEvent,
}: {
  codexTasks: CodexTaskLike[];
  logClientEvent?: (kind: string, payload?: Record<string, unknown>) => void;
}) {
  const [state, setState] = useState<VoiceMusicState>({
    controlEnabled: false,
    mode: "auto",
    source: "somafm",
    desiredStyle: DEFAULT_STYLE,
    userVolume: 0.8,
    generationStatus: "idle",
    isPlaying: false,
    assistantSpeaking: false,
    userSpeaking: false,
    agentBusy: false,
  });

  const stateRef = useRef(state);
  const musicAudioContextRef = useRef<AudioContext | null>(null);
  const assistantAudioContextRef = useRef<AudioContext | null>(null);
  const slotsRef = useRef<[MusicSlot, MusicSlot] | null>(null);
  const decodedSomaFmRef = useRef<DecodedSomaFmStream | null>(null);
  const activeSlotIndexRef = useRef(0);
  const releaseTimerRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const userSpeechFallbackTimerRef = useRef<number | null>(null);
  const volumeSettleTimerRefs = useRef<number[]>([]);
  const lastManualVolumeAtRef = useRef(0);
  const lastAutoBusyRef = useRef(false);
  const analyserFrameRef = useRef<number | null>(null);
  const settingsRef = useRef<MusicSourceSettings | null>(null);
  const libraryTracksRef = useRef<LocalMusicTrack[]>([]);
  const libraryIndexRef = useRef(0);
  const somaChannelIdRef = useRef(DEFAULT_SOMAFM_CHANNEL_ID);
  const libraryRepeatAllRef = useRef(true);
  const assistantMeterRef = useRef<{
    stream: MediaStream;
    source: MediaStreamAudioSourceNode;
    analyser: AnalyserNode;
    speaking: boolean;
    lastVoiceAt: number;
  } | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const patchState = useCallback((patch: Partial<VoiceMusicState>) => {
    const next = { ...stateRef.current, ...patch };
    stateRef.current = next;
    setState(next);
  }, []);

  const clearReleaseTimer = useCallback(() => {
    if (releaseTimerRef.current !== null) {
      window.clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
  }, []);

  const clearUserSpeechFallbackTimer = useCallback(() => {
    if (userSpeechFallbackTimerRef.current !== null) {
      window.clearTimeout(userSpeechFallbackTimerRef.current);
      userSpeechFallbackTimerRef.current = null;
    }
  }, []);

  const clearVolumeSettleTimers = useCallback(() => {
    for (const timer of volumeSettleTimerRefs.current) window.clearTimeout(timer);
    volumeSettleTimerRefs.current = [];
  }, []);

  const ensureSlots = useCallback(async () => {
    if (slotsRef.current) {
      await resumeAudioContextIfNeeded(musicAudioContextRef.current);
      return slotsRef.current;
    }
    const AudioContextCtor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const context = AudioContextCtor ? new AudioContextCtor() : null;
    await resumeAudioContextIfNeeded(context);
    musicAudioContextRef.current = context;
    const makeSlot = (): MusicSlot => {
      const audio = makeMusicAudioElement();
      if (!context) {
        return {
          audio,
          sourceVolumeTimer: null,
          duckingTimer: null,
          sourceVolumeValue: stateRef.current.userVolume,
          duckingGainValue: 0,
        };
      }
      const mediaSource = context.createMediaElementSource(audio);
      const sourceGain = context.createGain();
      const duckingGain = context.createGain();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      sourceGain.gain.value = stateRef.current.userVolume;
      duckingGain.gain.value = 0;
      mediaSource.connect(sourceGain);
      sourceGain.connect(duckingGain);
      duckingGain.connect(analyser);
      analyser.connect(context.destination);
      return {
        audio,
        mediaSource,
        sourceGain,
        duckingGain,
        analyser,
        analyserData: new Float32Array(analyser.fftSize),
        sourceVolumeTimer: null,
        duckingTimer: null,
        sourceVolumeValue: stateRef.current.userVolume,
        duckingGainValue: 0,
      };
    };
    slotsRef.current = [makeSlot(), makeSlot()];
    return slotsRef.current;
  }, []);

  const activeMusicGainSource = useCallback(() => {
    const source = activeMusicSource(stateRef.current);
    return source === "somafm" && decodedSomaFmRef.current?.active ? "somafm-decoded" : source;
  }, []);

  const currentDuckingGain = useCallback(() => {
    return computeMusicDucking({ ...stateRef.current, source: activeMusicGainSource() }).duckingGain;
  }, [activeMusicGainSource]);

  const setFallbackElementVolume = useCallback((slot: MusicSlot) => {
    const source = slot.item?.source || activeMusicSource(stateRef.current);
    const capabilities = musicSourceCapabilities(source);
    if (capabilities.externalStream) {
      const elementVolume = musicUserVolumeToElementVolume(slot.sourceVolumeValue) * musicDuckingGainToElementVolumeRatio(slot.duckingGainValue);
      slot.audio.volume = elementVolume;
      slot.audio.muted = elementVolume <= 0;
      return;
    }
    if (slot.sourceGain && slot.duckingGain) {
      slot.audio.volume = 1;
      slot.audio.muted = false;
      return;
    }
    const elementVolume = Math.min(1, Math.max(0, slot.sourceVolumeValue * slot.duckingGainValue));
    slot.audio.volume = elementVolume;
    slot.audio.muted = elementVolume <= 0;
  }, []);

  const resetSlotAudio = useCallback((slot: MusicSlot) => {
    if (slot.sourceVolumeTimer !== null && slot.sourceVolumeTimer !== undefined) window.clearInterval(slot.sourceVolumeTimer);
    if (slot.duckingTimer !== null && slot.duckingTimer !== undefined) window.clearInterval(slot.duckingTimer);
    slot.sourceVolumeTimer = null;
    slot.duckingTimer = null;
    slot.audio.pause();
    slot.audio.onended = null;
    slot.audio.onerror = null;
    slot.audio.removeAttribute("src");
    slot.audio.load();
    slot.item = undefined;
  }, []);

  const connectSlotGraph = useCallback(
    (slot: MusicSlot) => {
      if (slot.sourceGain && slot.duckingGain) return true;
      const context = musicAudioContextRef.current;
      if (!context) return false;
      try {
        const mediaSource = context.createMediaElementSource(slot.audio);
        const sourceGain = context.createGain();
        const duckingGain = context.createGain();
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        sourceGain.gain.value = slot.sourceVolumeValue;
        duckingGain.gain.value = slot.duckingGainValue;
        mediaSource.connect(sourceGain);
        sourceGain.connect(duckingGain);
        duckingGain.connect(analyser);
        analyser.connect(context.destination);
        slot.mediaSource = mediaSource;
        slot.sourceGain = sourceGain;
        slot.duckingGain = duckingGain;
        slot.analyser = analyser;
        slot.analyserData = new Float32Array(analyser.fftSize);
        return true;
      } catch (error) {
        logClientEvent?.("voice_music_graph_connect_failed", {
          reason: error instanceof Error ? error.message : "music_graph_connect_failed",
          src: compactAudioSrc(slot.audio.currentSrc || slot.audio.src),
        });
        return false;
      }
    },
    [logClientEvent],
  );

  const prepareSlotUrl = useCallback(
    (slot: MusicSlot, url: string) => {
      slot.audio.src = url;
      connectSlotGraph(slot);
      if (slot.sourceGain) slot.sourceGain.gain.value = slot.sourceVolumeValue;
      if (slot.duckingGain) slot.duckingGain.gain.value = slot.duckingGainValue;
      slot.audio.volume = slot.sourceGain ? 1 : Math.min(slot.sourceVolumeValue, 1);
      setFallbackElementVolume(slot);
    },
    [connectSlotGraph, setFallbackElementVolume],
  );

  const rampSlotSourceVolume = useCallback((slot: MusicSlot | undefined, value: number, seconds: number) => {
    if (!slot) return;
    if (slot.sourceVolumeTimer !== null && slot.sourceVolumeTimer !== undefined) window.clearInterval(slot.sourceVolumeTimer);
    const target = Math.max(0, Math.min(Number.isFinite(value) ? value : 0, MAX_MUSIC_USER_VOLUME));
    const gainParam = slot.sourceGain?.gain;
    const start = gainParam ? gainParam.value : slot.sourceVolumeValue;
    if (gainParam) slot.audio.volume = 1;
    const startedAt = performance.now();
    const durationMs = Math.max(0, seconds * 1000);
    if (durationMs <= 0) {
      if (gainParam) gainParam.value = target;
      slot.sourceVolumeValue = target;
      if (gainParam) slot.audio.volume = 1;
      setFallbackElementVolume(slot);
      slot.sourceVolumeTimer = null;
      return;
    }
    slot.sourceVolumeTimer = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / durationMs);
      const next = start + (target - start) * progress;
      if (gainParam) gainParam.value = next;
      if (gainParam) slot.audio.volume = 1;
      slot.sourceVolumeValue = next;
      setFallbackElementVolume(slot);
      if (progress >= 1) {
        if (slot.sourceVolumeTimer !== null && slot.sourceVolumeTimer !== undefined) window.clearInterval(slot.sourceVolumeTimer);
        slot.sourceVolumeTimer = null;
      }
    }, 30);
  }, [setFallbackElementVolume]);

  const rampSlotDuckingGain = useCallback((slot: MusicSlot | undefined, value: number, seconds: number) => {
    if (!slot) return;
    if (slot.duckingTimer !== null && slot.duckingTimer !== undefined) window.clearInterval(slot.duckingTimer);
    const target = Math.max(0, Math.min(Number.isFinite(value) ? value : 0, 1));
    const gainParam = slot.duckingGain?.gain;
    const start = gainParam ? gainParam.value : slot.duckingGainValue;
    const startedAt = performance.now();
    const durationMs = Math.max(0, seconds * 1000);
    if (durationMs <= 0) {
      if (gainParam) gainParam.value = target;
      slot.duckingGainValue = target;
      setFallbackElementVolume(slot);
      slot.duckingTimer = null;
      return;
    }
    slot.duckingTimer = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / durationMs);
      const next = start + (target - start) * progress;
      if (gainParam) gainParam.value = next;
      slot.duckingGainValue = next;
      setFallbackElementVolume(slot);
      if (progress >= 1) {
        if (slot.duckingTimer !== null && slot.duckingTimer !== undefined) window.clearInterval(slot.duckingTimer);
        slot.duckingTimer = null;
      }
    }, 30);
  }, [setFallbackElementVolume]);

  const rampDecodedSourceVolume = useCallback((stream: DecodedSomaFmStream | null | undefined, value: number, seconds: number) => {
    if (!stream) return;
    if (stream.sourceVolumeTimer !== null) window.clearInterval(stream.sourceVolumeTimer);
    const target = Math.max(0, Math.min(Number.isFinite(value) ? value : 0, MAX_MUSIC_USER_VOLUME));
    const gainParam = stream.sourceGain.gain;
    const start = gainParam.value;
    const startedAt = performance.now();
    const durationMs = Math.max(0, seconds * 1000);
    if (durationMs <= 0) {
      gainParam.value = target;
      stream.sourceVolumeValue = target;
      stream.sourceVolumeTimer = null;
      return;
    }
    stream.sourceVolumeTimer = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / durationMs);
      const next = start + (target - start) * progress;
      gainParam.value = next;
      stream.sourceVolumeValue = next;
      if (progress >= 1) {
        if (stream.sourceVolumeTimer !== null) window.clearInterval(stream.sourceVolumeTimer);
        stream.sourceVolumeTimer = null;
      }
    }, 30);
  }, []);

  const rampDecodedDuckingGain = useCallback((stream: DecodedSomaFmStream | null | undefined, value: number, seconds: number) => {
    if (!stream) return;
    if (stream.duckingTimer !== null) window.clearInterval(stream.duckingTimer);
    const target = Math.max(0, Math.min(Number.isFinite(value) ? value : 0, 1));
    const gainParam = stream.duckingGain.gain;
    const start = gainParam.value;
    const startedAt = performance.now();
    const durationMs = Math.max(0, seconds * 1000);
    if (durationMs <= 0) {
      gainParam.value = target;
      stream.duckingGainValue = target;
      stream.duckingTimer = null;
      return;
    }
    stream.duckingTimer = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / durationMs);
      const next = start + (target - start) * progress;
      gainParam.value = next;
      stream.duckingGainValue = next;
      if (progress >= 1) {
        if (stream.duckingTimer !== null) window.clearInterval(stream.duckingTimer);
        stream.duckingTimer = null;
      }
    }, 30);
  }, []);

  const stopDecodedSomaFm = useCallback(
    (fadeSec = 0) => {
      const stream = decodedSomaFmRef.current;
      if (!stream) return;
      decodedSomaFmRef.current = null;
      stream.active = false;
      if (stream.sourceVolumeTimer !== null) window.clearInterval(stream.sourceVolumeTimer);
      if (stream.duckingTimer !== null) window.clearInterval(stream.duckingTimer);
      stream.sourceVolumeTimer = null;
      stream.duckingTimer = null;
      stream.abortController.abort();
      rampDecodedDuckingGain(stream, 0, fadeSec);
      window.setTimeout(() => {
        try {
          stream.decoder?.free();
        } catch {
          // best-effort cleanup
        }
        try {
          stream.sourceGain.disconnect();
          stream.duckingGain.disconnect();
          stream.analyser.disconnect();
        } catch {
          // best-effort cleanup
        }
      }, Math.max(0, fadeSec * 1000 + 80));
    },
    [rampDecodedDuckingGain],
  );

  const scheduleDecodedSomaFmAudio = useCallback(
    (stream: DecodedSomaFmStream, decoded: DecodedMp3AudioData) => {
      const channelData = decoded.channelData || [];
      const firstChannel = channelData[0];
      const sampleRate = Number(decoded.sampleRate);
      if (!firstChannel?.length || !Number.isFinite(sampleRate) || sampleRate <= 0) return false;
      const context = stream.sourceGain.context;
      const channelCount = Math.max(1, Math.min(channelData.length || 1, 2));
      const frameCount = firstChannel.length;
      const buffer = context.createBuffer(channelCount, frameCount, sampleRate);
      for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
        buffer.copyToChannel(Float32Array.from(channelData[channelIndex] || firstChannel), channelIndex);
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(stream.sourceGain);
      const now = context.currentTime;
      if (stream.scheduledTime < now + SOMAFM_DECODE_UNDERRUN_LEAD_SEC) {
        stream.scheduledTime = now + SOMAFM_DECODE_BUFFER_LEAD_SEC;
        logClientEvent?.("voice_music_somafm_decode_underrun", {
          source: stream.item.source,
          id: stream.item.id,
          decoded_lead_sec: Number((stream.scheduledTime - now).toFixed(3)),
          buffers_scheduled: stream.buffersScheduled,
        });
      }
      source.start(stream.scheduledTime);
      stream.scheduledTime += frameCount / sampleRate;
      stream.buffersScheduled += 1;
      stream.samplesScheduled += frameCount;
      return true;
    },
    [logClientEvent],
  );

  const startDecodedSomaFm = useCallback(
    async (item: PlayableMusicItem, candidates: string[]) => {
      await ensureSlots();
      const context = musicAudioContextRef.current;
      if (!context) throw new Error("web_audio_unavailable");
      await resumeAudioContextIfNeeded(context);
      const playableCandidates = candidates.filter(
        (url) => /^https?:\/\//i.test(url) && !/\.(pls|m3u|m3u8)(?:$|[?#])/i.test(url),
      );
      if (!playableCandidates.length) throw new Error("somafm_decode_no_direct_mp3_url");

      stopDecodedSomaFm(0);
      const module = (await import("@audio/decode-mp3")) as { decoder: () => Promise<StreamingMp3Decoder> };
      const mp3Decoder = await module.decoder();
      const sourceGain = context.createGain();
      const duckingGain = context.createGain();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      sourceGain.gain.value = normalizeMusicUserVolume(stateRef.current.userVolume);
      duckingGain.gain.value = currentDuckingGain();
      sourceGain.connect(duckingGain);
      duckingGain.connect(analyser);
      analyser.connect(context.destination);

      const decodedItem: PlayableMusicItem = { ...item, streamKind: "decoded-radio" };
      const stream: DecodedSomaFmStream = {
        item: decodedItem,
        sourceUrl: playableCandidates[0],
        abortController: new AbortController(),
        decoder: mp3Decoder,
        sourceGain,
        duckingGain,
        analyser,
        analyserData: new Float32Array(analyser.fftSize),
        scheduledTime: context.currentTime + SOMAFM_DECODE_BUFFER_LEAD_SEC,
        sourceVolumeTimer: null,
        duckingTimer: null,
        sourceVolumeValue: normalizeMusicUserVolume(stateRef.current.userVolume),
        duckingGainValue: duckingGain.gain.value,
        chunksDecoded: 0,
        buffersScheduled: 0,
        samplesScheduled: 0,
        active: true,
        startedAt: performance.now(),
      };
      decodedSomaFmRef.current = stream;
      stream.duckingGain.gain.value = currentDuckingGain();
      stream.duckingGainValue = stream.duckingGain.gain.value;

      let firstBufferResolved = false;
      let resolveFirstBuffer: () => void = () => undefined;
      let rejectFirstBuffer: (error: Error) => void = () => undefined;
      const firstBufferPromise = new Promise<void>((resolve, reject) => {
        resolveFirstBuffer = resolve;
        rejectFirstBuffer = reject;
      });

      const pump = async () => {
        let lastError: Error | null = null;
        for (const candidate of playableCandidates) {
          if (!stream.active) return;
          stream.sourceUrl = candidate;
          try {
            const response = await fetch(candidate, {
              cache: "no-store",
              mode: "cors",
              signal: stream.abortController.signal,
            });
            const contentType = response.headers.get("content-type") || "";
            if (!response.ok || !response.body) throw new Error(`somafm_decode_http_${response.status}`);
            if (contentType && !/mpeg|mp3|audio/i.test(contentType)) throw new Error(`somafm_decode_unsupported_${contentType}`);
            const reader = response.body.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (!stream.active) return;
              if (done) throw new Error("somafm_decode_stream_ended");
              if (!value?.length) continue;
              stream.chunksDecoded += 1;
              const decoded = stream.decoder?.decode(value);
              if (decoded && scheduleDecodedSomaFmAudio(stream, decoded) && !firstBufferResolved) {
                firstBufferResolved = true;
                resolveFirstBuffer();
              }
            }
          } catch (error) {
            if (stream.abortController.signal.aborted || !stream.active) return;
            lastError = error instanceof Error ? error : new Error("somafm_decode_failed");
            logClientEvent?.("voice_music_somafm_decode_candidate_failed", {
              source: item.source,
              id: item.id,
              reason: lastError.message,
              src: compactAudioSrc(candidate),
            });
          }
        }
        if (!firstBufferResolved) rejectFirstBuffer(lastError || new Error("somafm_decode_failed"));
        if (stream.active) {
          patchState({ error: lastError?.message || "somafm_decode_failed", isPlaying: false });
          stopDecodedSomaFm(0);
        }
      };

      void pump();
      try {
        await Promise.race([
          firstBufferPromise,
          new Promise((_, reject) => window.setTimeout(() => reject(new Error("somafm_decode_start_timeout")), STREAM_PLAY_START_TIMEOUT_MS)),
        ]);
      } catch (error) {
        stopDecodedSomaFm(0);
        throw error;
      }
      patchState({
        source: "somafm",
        currentItem: decodedItem,
        isPlaying: true,
        generationStatus: "idle",
        error: undefined,
      });
      logClientEvent?.("voice_music_somafm_decoded_started", {
        source: item.source,
        id: item.id,
        candidate_count: playableCandidates.length,
        audio_context_state: context.state,
        ...decodedSomaFmDiagnostics(stream),
      });
    },
    [
      currentDuckingGain,
      ensureSlots,
      logClientEvent,
      patchState,
      scheduleDecodedSomaFmAudio,
      stopDecodedSomaFm,
    ],
  );

  const applySourceVolume = useCallback((seconds = MANUAL_VOLUME_RAMP_SEC) => {
    const slots = slotsRef.current;
    const volume = normalizeMusicUserVolume(stateRef.current.userVolume);
    if (slots) {
      for (const slot of slots) rampSlotSourceVolume(slot, volume, seconds);
    }
    rampDecodedSourceVolume(decodedSomaFmRef.current, volume, seconds);
  }, [rampDecodedSourceVolume, rampSlotSourceVolume]);

  const applyDuckingGain = useCallback((seconds = RELEASE_TIME_SEC) => {
    const slots = slotsRef.current;
    const target = currentDuckingGain();
    if (slots) {
      const activeIndex = activeSlotIndexRef.current;
      slots.forEach((slot, index) => rampSlotDuckingGain(slot, index === activeIndex ? target : 0, seconds));
    }
    rampDecodedDuckingGain(decodedSomaFmRef.current, target, seconds);
  }, [currentDuckingGain, rampDecodedDuckingGain, rampSlotDuckingGain]);

  const scheduleManualVolumeSettle = useCallback(() => {
    clearVolumeSettleTimers();
    const delays = [250, 900, 1800, 3200];
    volumeSettleTimerRefs.current = delays.map((delay) =>
      window.setTimeout(() => {
        void resumeAudioContextIfNeeded(musicAudioContextRef.current).then(() => {
          applySourceVolume(MANUAL_VOLUME_RAMP_SEC);
          const playbackSource = activeMusicSource(stateRef.current);
          const gainSource = activeMusicGainSource();
          const gain = computeMusicOutputGain({ ...stateRef.current, source: gainSource });
          const activeSlot = slotsRef.current?.[activeSlotIndexRef.current];
          logClientEvent?.("voice_music_volume_settle", {
            delay_ms: delay,
            source: playbackSource,
            gain_source: gainSource,
            source_volume: gain.sourceVolume,
            ducking_gain: gain.duckingGain,
            output_gain: gain.outputGain,
            ducking: gain.ducking,
            ducking_supported: gain.duckingSupported,
            programmatic_volume: gain.programmaticVolume,
            external_stream: gain.externalStream,
            user_speaking: stateRef.current.userSpeaking,
            assistant_speaking: stateRef.current.assistantSpeaking,
            audio_context_state: musicAudioContextRef.current?.state || "none",
            ...musicSlotDiagnostics(activeSlot),
            ...decodedSomaFmDiagnostics(decodedSomaFmRef.current),
          });
        });
      }, delay),
    );
  }, [activeMusicGainSource, applySourceVolume, clearVolumeSettleTimers, logClientEvent]);

  const loadMusicSettings = useCallback(
    async (force = false) => {
      if (!force && settingsRef.current) return settingsRef.current;
      const response = await fetch("/api/music/settings", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; settings?: MusicSourceSettings } | null;
      if (!response.ok || !payload?.ok || !payload.settings) throw new Error("music_settings_unavailable");
      settingsRef.current = payload.settings;
      somaChannelIdRef.current = normalizeChannelId(payload.settings.somafm.defaultChannelId) || DEFAULT_SOMAFM_CHANNEL_ID;
      libraryRepeatAllRef.current = payload.settings.library.repeatMode !== "off";
      patchState({
        source: normalizeMusicSource(payload.settings.defaultSource),
        desiredStyle: normalizeStyle(payload.settings.aceStep.defaultStyle),
      });
      return payload.settings;
    },
    [patchState],
  );

  const stopMusic = useCallback(() => {
    clearReleaseTimer();
    if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    stopDecodedSomaFm(FADE_OUT_SEC);
    const slots = slotsRef.current;
    if (!slots) {
      patchState({ isPlaying: false });
      return;
    }
    for (const slot of slots) rampSlotDuckingGain(slot, 0, FADE_OUT_SEC);
    stopTimerRef.current = window.setTimeout(() => {
      for (const slot of slots) {
        resetSlotAudio(slot);
        slot.duckingGainValue = 0;
      }
      patchState({ isPlaying: false, currentItem: undefined });
    }, FADE_OUT_SEC * 1000 + 80);
  }, [clearReleaseTimer, patchState, rampSlotDuckingGain, resetSlotAudio, stopDecodedSomaFm]);

  const playItem = useCallback(
    async (item: PlayableMusicItem) => {
      const slots = await ensureSlots();
      const oldIndex = activeSlotIndexRef.current;
      const nextIndex = oldIndex === 0 ? 1 : 0;
      const oldSlot = slots[oldIndex];
      const nextSlot = slots[nextIndex];
      if (stopTimerRef.current !== null) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }

      resetSlotAudio(nextSlot);
      nextSlot.item = item;
      nextSlot.audio.loop = item.source === "ace-step";
      nextSlot.audio.currentTime = 0;
      nextSlot.sourceVolumeValue = normalizeMusicUserVolume(stateRef.current.userVolume);
      nextSlot.duckingGainValue = 0;

      let fallbackIndex = 0;
      const candidates = [item.audioUrl, ...(item.candidateUrls || [])]
        .filter((url, index, rows) => /^https?:\/\//i.test(url) || url.startsWith("/api/"))
        .filter((url, index, rows) => rows.indexOf(url) === index);
      if (item.source === "somafm") {
        try {
          await startDecodedSomaFm(item, candidates);
          for (const slot of slots) rampSlotDuckingGain(slot, 0, CROSSFADE_SEC);
          window.setTimeout(() => {
            for (const slot of slots) {
              resetSlotAudio(slot);
              slot.duckingGainValue = 0;
            }
          }, CROSSFADE_SEC * 1000 + 100);
          return;
        } catch (error) {
          logClientEvent?.("voice_music_somafm_decode_fallback_to_direct", {
            source: item.source,
            id: item.id,
            reason: error instanceof Error ? error.message : "somafm_decode_failed",
            candidate_count: candidates.length,
          });
        }
      } else {
        stopDecodedSomaFm(FADE_OUT_SEC);
      }
      prepareSlotUrl(nextSlot, candidates[0] || item.audioUrl);
      nextSlot.audio.onerror = () => {
        fallbackIndex += 1;
        const fallbackUrl = candidates[fallbackIndex];
        if (!fallbackUrl) {
          patchState({ error: "music_playback_failed", isPlaying: false });
          logClientEvent?.("voice_music_playback_failed", {
            source: item.source,
            id: item.id,
            reason: "audio_error_candidates_exhausted",
          });
          return;
        }
        prepareSlotUrl(nextSlot, fallbackUrl);
        const playFallback =
          item.source === "somafm" ? nextSlot.audio.play() : playWithTimeout(nextSlot.audio, STREAM_PLAY_START_TIMEOUT_MS);
        void playFallback.catch(() => {
          patchState({ error: "music_playback_failed", isPlaying: false });
          logClientEvent?.("voice_music_playback_failed", {
            source: item.source,
            id: item.id,
            reason: "audio_error_fallback_failed",
          });
        });
      };

      nextSlot.audio.onended = () => {
        if (item.source === "library" && libraryRepeatAllRef.current && libraryTracksRef.current.length > 1) {
          const next = (libraryIndexRef.current + 1) % libraryTracksRef.current.length;
          libraryIndexRef.current = next;
          void playItem(itemFromLocalTrack(libraryTracksRef.current[next])).catch(() => {
            patchState({ error: "music_playback_failed", isPlaying: false });
          });
        }
      };

      if (item.source === "somafm") {
        fallbackIndex = 0;
        void nextSlot.audio
          .play()
          .then(() => {
            logClientEvent?.("voice_music_playback_started", {
              source: item.source,
              id: item.id,
              stream_kind: item.streamKind,
              candidate_count: candidates.length,
              audio_context_state: musicAudioContextRef.current?.state || "none",
              ...musicSlotDiagnostics(nextSlot),
            });
          })
          .catch((error) => {
            const message = error instanceof Error ? error.message : "music_playback_failed";
            patchState({ error: message, isPlaying: false });
            logClientEvent?.("voice_music_playback_failed", {
              source: item.source,
              id: item.id,
              reason: message,
              candidate_count: candidates.length,
            });
          });
      } else {
        let lastPlaybackError = "music_playback_failed";
        for (let index = 0; index < Math.max(1, candidates.length); index += 1) {
          const candidate = candidates[index] || item.audioUrl;
          fallbackIndex = index;
          prepareSlotUrl(nextSlot, candidate);
          try {
            await playWithTimeout(nextSlot.audio, STREAM_PLAY_START_TIMEOUT_MS);
            lastPlaybackError = "";
            break;
          } catch (error) {
            lastPlaybackError = error instanceof Error ? error.message : "music_playback_failed";
            nextSlot.audio.pause();
          }
        }
        if (lastPlaybackError) {
          patchState({ error: lastPlaybackError, isPlaying: false });
          logClientEvent?.("voice_music_playback_failed", {
            source: item.source,
            id: item.id,
            reason: lastPlaybackError,
            candidate_count: candidates.length,
          });
          throw new Error(lastPlaybackError);
        }
      }
      activeSlotIndexRef.current = nextIndex;
      rampSlotDuckingGain(oldSlot, 0, CROSSFADE_SEC);
      rampSlotSourceVolume(nextSlot, normalizeMusicUserVolume(stateRef.current.userVolume), 0);
      rampSlotDuckingGain(nextSlot, currentDuckingGain(), CROSSFADE_SEC);
      window.setTimeout(() => {
        resetSlotAudio(oldSlot);
        oldSlot.duckingGainValue = 0;
      }, CROSSFADE_SEC * 1000 + 100);
      patchState({
        source: item.source,
        currentItem: item,
        isPlaying: true,
        generationStatus: "idle",
        error: undefined,
      });
    },
    [
      currentDuckingGain,
      ensureSlots,
      logClientEvent,
      patchState,
      prepareSlotUrl,
      rampSlotDuckingGain,
      rampSlotSourceVolume,
      resetSlotAudio,
      startDecodedSomaFm,
      stopDecodedSomaFm,
    ],
  );

  const pollGeneration = useCallback(
    (generationId: string, expectedStyle: string) => {
      if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = window.setInterval(() => {
        const params = new URLSearchParams({ generation_id: generationId, style: expectedStyle });
        void fetch(`/api/music/state?${params.toString()}`, { cache: "no-store" })
          .then((response) => response.json())
          .then(async (payload: { generation?: { status?: string; track?: unknown; error?: string } }) => {
            const generation = payload.generation;
            if (!generation) return;
            if (generation.status === "failed") {
              if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
              patchState({ generationStatus: "failed", error: generation.error || "music_generation_failed" });
              return;
            }
            if (generation.status === "complete") {
              if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
              const track = publicTrackFromPayload(generation.track);
              if (track && stateRef.current.controlEnabled && stateRef.current.desiredStyle === expectedStyle) {
                await playItem(itemFromGeneratedTrack(track));
              }
            }
          })
          .catch(() => undefined);
      }, 2000);
    },
    [patchState, playItem],
  );

  const ensureGeneratedTrack = useCallback(
    async (
      style: string,
      forceFresh = false,
      options: { operatorRequest?: string; preserveCurrent?: boolean; referenceStyle?: string; referencePrompt?: string } = {},
    ) => {
      if (!stateRef.current.controlEnabled) return { ok: false, error: "music_control_disabled" };
      const desiredStyle = normalizeStyle(style);
      patchState({ source: "ace-step", desiredStyle, generationStatus: "queued", error: undefined });
      const response = await fetch("/api/music/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          style: desiredStyle,
          operatorRequest: options.operatorRequest || "",
          preserveCurrent: options.preserveCurrent === true,
          referenceStyle: options.referenceStyle || "",
          referencePrompt: options.referencePrompt || "",
          forceFresh,
        }),
      });
      const payload = (await response.json().catch(() => ({ ok: false, error: "music_generate_non_json" }))) as {
        ok?: boolean;
        status?: string;
        track?: unknown;
        generationId?: string;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        patchState({ generationStatus: "failed", error: payload.error || `music_generate_failed_${response.status}` });
        return payload;
      }
      const track = publicTrackFromPayload(payload.track);
      if (track) await playItem(itemFromGeneratedTrack(track));
      if (payload.generationId) {
        patchState({ generationStatus: payload.status === "generating" ? "generating" : "queued" });
        pollGeneration(payload.generationId, desiredStyle);
      }
      return payload;
    },
    [patchState, playItem, pollGeneration],
  );

  const ensureSomaFmChannel = useCallback(
    async (channelId?: string) => {
      const id = normalizeChannelId(channelId) || somaChannelIdRef.current || DEFAULT_SOMAFM_CHANNEL_ID;
      const params = new URLSearchParams({ channel_id: id, format: "mp3", quality: "highest", resolve: "1" });
      const response = await fetch(`/api/music/somafm/playback-url?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({ ok: false, error: "somafm_playback_non_json" }))) as SomaFmPlaybackPayload;
      const item = itemFromSomaFmPlayback(payload);
      if (!response.ok || !item) {
        const error = payload.error || `somafm_playback_failed_${response.status}`;
        patchState({ source: "somafm", error });
        return { ok: false, error };
      }
      somaChannelIdRef.current = item.id;
      patchState({ source: "somafm", error: undefined });
      try {
        await playItem(item);
      } catch (error) {
        const message = error instanceof Error ? error.message : "somafm_playback_failed";
        patchState({ source: "somafm", error: message, isPlaying: false });
        return { ok: false, error: message, channel_id: item.id, item };
      }
      return { ok: true, status: "playing", item };
    },
    [patchState, playItem],
  );

  const loadLibraryTracks = useCallback(async (force = false) => {
    if (!force && libraryTracksRef.current.length) return libraryTracksRef.current;
    const response = await fetch("/api/music/library/tracks", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({ ok: false, tracks: [] }))) as { ok?: boolean; tracks?: LocalMusicTrack[]; error?: string };
    if (!response.ok || !payload.ok || !Array.isArray(payload.tracks)) throw new Error(payload.error || "music_library_unavailable");
    libraryTracksRef.current = payload.tracks;
    return payload.tracks;
  }, []);

  const ensureLibraryTrack = useCallback(
    async (direction: "current" | "next" | "previous" = "current", query?: unknown) => {
      const tracks = await loadLibraryTracks(direction !== "current");
      if (!tracks.length) {
        patchState({ source: "library", error: "music_library_empty" });
        return { ok: false, error: "music_library_empty" };
      }
      const queryText = String(query || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (queryText) {
        const found = tracks.find((track) => `${track.title} ${track.fileName} ${track.relativePath}`.toLowerCase().includes(queryText));
        if (found) libraryIndexRef.current = tracks.findIndex((track) => track.id === found.id);
      } else if (direction === "next") {
        libraryIndexRef.current = (libraryIndexRef.current + 1) % tracks.length;
      } else if (direction === "previous") {
        libraryIndexRef.current = (libraryIndexRef.current - 1 + tracks.length) % tracks.length;
      } else {
        libraryIndexRef.current = Math.min(libraryIndexRef.current, tracks.length - 1);
      }
      const track = tracks[libraryIndexRef.current] || tracks[0];
      patchState({ source: "library", error: undefined });
      await playItem(itemFromLocalTrack(track));
      return { ok: true, status: "playing", track };
    },
    [loadLibraryTracks, patchState, playItem],
  );

  const findSomaChannelByQuery = useCallback(async (query: unknown) => {
    const text = String(query || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!text) return "";
    const response = await fetch("/api/music/somafm/channels", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({ ok: false }))) as SomaFmChannelsPayload;
    if (!payload.ok || !Array.isArray(payload.channels)) return "";
    const found = payload.channels.find((channel) => `${channel.title} ${channel.genre || ""} ${channel.description || ""}`.toLowerCase().includes(text));
    return found?.id || "";
  }, []);

  const playAdjacentSomaChannel = useCallback(
    async (direction: "next" | "previous") => {
      const response = await fetch("/api/music/somafm/channels", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({ ok: false }))) as SomaFmChannelsPayload;
      if (!payload.ok || !Array.isArray(payload.channels) || !payload.channels.length) {
        patchState({ source: "somafm", error: payload.error || "somafm_channels_unavailable" });
        return { ok: false, error: payload.error || "somafm_channels_unavailable" };
      }
      const current = somaChannelIdRef.current || DEFAULT_SOMAFM_CHANNEL_ID;
      const index = Math.max(0, payload.channels.findIndex((channel) => channel.id === current));
      const nextIndex = direction === "next" ? (index + 1) % payload.channels.length : (index - 1 + payload.channels.length) % payload.channels.length;
      return await ensureSomaFmChannel(payload.channels[nextIndex]?.id);
    },
    [ensureSomaFmChannel, patchState],
  );

  const ensureSourcePlaying = useCallback(
    async (source: MusicSource, args: MusicControlArgs = {}) => {
      if (source === "ace-step") return await ensureGeneratedTrack(normalizeStyle(args.style || stateRef.current.desiredStyle));
      if (source === "library") return await ensureLibraryTrack("current", args.query);
      const explicitChannel = normalizeChannelId(args.channel_id);
      const queryChannel = explicitChannel ? "" : await findSomaChannelByQuery(args.query);
      return await ensureSomaFmChannel(explicitChannel || queryChannel || undefined);
    },
    [ensureGeneratedTrack, ensureLibraryTrack, ensureSomaFmChannel, findSomaChannelByQuery],
  );

  const recomputeDucking = useCallback(
    (release = false) => {
      clearReleaseTimer();
      const current = stateRef.current;
      if (!current.controlEnabled || current.mode === "off") {
        applyDuckingGain(FADE_OUT_SEC);
        return;
      }
      if (current.userSpeaking || current.assistantSpeaking) {
        applyDuckingGain(DUCK_ATTACK_SEC);
        return;
      }
      if (release) {
        const recentManualVolume = performance.now() - lastManualVolumeAtRef.current < 8000;
        releaseTimerRef.current = window.setTimeout(
          () => applyDuckingGain(recentManualVolume ? MANUAL_VOLUME_RELEASE_SEC : RELEASE_TIME_SEC),
          recentManualVolume ? MANUAL_VOLUME_RELEASE_DELAY_MS : RELEASE_DELAY_MS,
        );
      } else {
        applyDuckingGain(RELEASE_TIME_SEC);
      }
    },
    [applyDuckingGain, clearReleaseTimer],
  );

  const setControlEnabled = useCallback(
    (enabled: boolean) => {
      patchState({ controlEnabled: enabled, error: undefined });
      logClientEvent?.("voice_music_control_gate", { enabled });
      if (enabled) {
        void ensureSlots().catch((error) => {
          patchState({ error: error instanceof Error ? error.message : "music_audio_context_unavailable" });
        });
        void loadMusicSettings().catch((error) => {
          patchState({ error: error instanceof Error ? error.message : "music_settings_unavailable" });
        });
        return;
      }

      if (stopTimerRef.current !== null) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      clearUserSpeechFallbackTimer();
      clearVolumeSettleTimers();
      const slots = slotsRef.current;
      if (slots) {
        for (const slot of slots) {
          if (slot.sourceVolumeTimer !== null && slot.sourceVolumeTimer !== undefined) window.clearInterval(slot.sourceVolumeTimer);
          if (slot.duckingTimer !== null && slot.duckingTimer !== undefined) window.clearInterval(slot.duckingTimer);
          slot.audio.pause();
          slot.audio.currentTime = 0;
          slot.audio.onended = null;
          slot.audio.onerror = null;
          slot.audio.removeAttribute("src");
          slot.audio.load();
          slot.item = undefined;
          slot.sourceVolumeTimer = null;
          slot.duckingTimer = null;
          slot.duckingGainValue = 0;
        }
      }
      slotsRef.current = null;
      if (musicAudioContextRef.current) {
        void musicAudioContextRef.current.close().catch(() => undefined);
        musicAudioContextRef.current = null;
      }
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (analyserFrameRef.current !== null) {
        window.cancelAnimationFrame(analyserFrameRef.current);
        analyserFrameRef.current = null;
      }
      assistantMeterRef.current?.source.disconnect();
      assistantMeterRef.current = null;
      if (assistantAudioContextRef.current) {
        void assistantAudioContextRef.current.close().catch(() => undefined);
        assistantAudioContextRef.current = null;
      }
      patchState({
        isPlaying: false,
        currentItem: undefined,
        assistantSpeaking: false,
        userSpeaking: false,
        agentBusy: false,
        generationStatus: "idle",
      });
      lastAutoBusyRef.current = false;
    },
    [clearUserSpeechFallbackTimer, clearVolumeSettleTimers, ensureSlots, loadMusicSettings, logClientEvent, patchState],
  );

  const onUserSpeechStart = useCallback(() => {
    if (!stateRef.current.controlEnabled) return;
    clearUserSpeechFallbackTimer();
    patchState({ userSpeaking: true });
    recomputeDucking(false);
    userSpeechFallbackTimerRef.current = window.setTimeout(() => {
      if (!stateRef.current.userSpeaking) return;
      patchState({ userSpeaking: false });
      recomputeDucking(true);
      logClientEvent?.("voice_music_user_speech_fallback_stop", {
        timeout_ms: USER_SPEECH_FALLBACK_STOP_MS,
        volume: stateRef.current.userVolume,
      });
    }, USER_SPEECH_FALLBACK_STOP_MS);
  }, [clearUserSpeechFallbackTimer, logClientEvent, patchState, recomputeDucking]);

  const onUserSpeechStop = useCallback(() => {
    if (!stateRef.current.controlEnabled) return;
    clearUserSpeechFallbackTimer();
    patchState({ userSpeaking: false });
    recomputeDucking(true);
  }, [clearUserSpeechFallbackTimer, patchState, recomputeDucking]);

  const ensureAssistantAudioContext = useCallback(async () => {
    if (assistantAudioContextRef.current) {
      await resumeAudioContextIfNeeded(assistantAudioContextRef.current);
      return assistantAudioContextRef.current;
    }
    const AudioContextCtor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) throw new Error("web_audio_unavailable");
    const context = new AudioContextCtor();
    await resumeAudioContextIfNeeded(context);
    assistantAudioContextRef.current = context;
    return context;
  }, []);

  const attachAssistantStream = useCallback(
    async (stream: MediaStream | null) => {
      if (!stream || !stateRef.current.controlEnabled) return;
      const context = await ensureAssistantAudioContext().catch(() => null);
      if (!context) return;
      if (assistantMeterRef.current?.stream === stream) return;
      if (analyserFrameRef.current !== null) window.cancelAnimationFrame(analyserFrameRef.current);
      assistantMeterRef.current?.source.disconnect();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const meter = {
        stream,
        source,
        analyser,
        speaking: false,
        lastVoiceAt: 0,
      };
      assistantMeterRef.current = meter;
      const data = new Float32Array(analyser.fftSize);
      const tick = () => {
        const activeMeter = assistantMeterRef.current;
        if (!activeMeter || !stateRef.current.controlEnabled) return;
        activeMeter.analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        const now = performance.now();
        if (rms > ASSISTANT_SPEECH_RMS_THRESHOLD) {
          activeMeter.lastVoiceAt = now;
          if (!activeMeter.speaking) {
            activeMeter.speaking = true;
            patchState({ assistantSpeaking: true });
            recomputeDucking(false);
          }
        } else if (activeMeter.speaking && now - activeMeter.lastVoiceAt > ASSISTANT_SPEECH_HANGOVER_MS) {
          activeMeter.speaking = false;
          patchState({ assistantSpeaking: false });
          recomputeDucking(true);
        }
        analyserFrameRef.current = window.requestAnimationFrame(tick);
      };
      analyserFrameRef.current = window.requestAnimationFrame(tick);
    },
    [ensureAssistantAudioContext, patchState, recomputeDucking],
  );

  const setMusicVolume = useCallback(
    async (value: unknown, reason = "ui") => {
      const requestedVolume = Number(value);
      if (!Number.isFinite(requestedVolume)) return { ok: false, error: "volume_required" };
      const volume = normalizeMusicUserVolume(requestedVolume);
      const previousVolume = stateRef.current.userVolume;
      lastManualVolumeAtRef.current = performance.now();
      patchState({ userVolume: volume });
      clearReleaseTimer();
      const audioContextStateBefore = musicAudioContextRef.current?.state || "none";
      await resumeAudioContextIfNeeded(musicAudioContextRef.current);
      const activeSlot = slotsRef.current?.[activeSlotIndexRef.current];
      if (activeSlot?.audio.src && stateRef.current.isPlaying) {
        void activeSlot.audio.play().catch((error) => {
          logClientEvent?.("voice_music_playback_resume_failed", {
            reason: error instanceof Error ? error.message : "music_playback_resume_failed",
            audio_context_state: musicAudioContextRef.current?.state || "none",
          });
        });
      }
      applySourceVolume(MANUAL_VOLUME_RAMP_SEC);
      scheduleManualVolumeSettle();
      const source = activeMusicSource(stateRef.current);
      const gainSource = activeMusicGainSource();
      const capabilities = musicSourceCapabilities(gainSource);
      const gain = computeMusicOutputGain({ ...stateRef.current, source: gainSource });
      logClientEvent?.("voice_music_volume_set", {
        reason,
        volume,
        level_percent: musicUserVolumeToPercent(volume),
        previous_volume: previousVolume,
        requested_volume: requestedVolume,
        source,
        gain_source: gainSource,
        source_volume: gain.sourceVolume,
        ducking_gain: gain.duckingGain,
        output_gain: gain.outputGain,
        ducking: gain.ducking,
        ducking_supported: gain.duckingSupported,
        programmatic_volume: gain.programmaticVolume,
        external_stream: gain.externalStream,
        user_speaking: stateRef.current.userSpeaking,
        assistant_speaking: stateRef.current.assistantSpeaking,
        has_slots: Boolean(slotsRef.current),
        active_slot: activeSlotIndexRef.current,
        audio_paused: activeSlot?.audio.paused ?? null,
        audio_context_state_before: audioContextStateBefore,
        audio_context_state: musicAudioContextRef.current?.state || "none",
        ...musicSlotDiagnostics(activeSlot),
        ...decodedSomaFmDiagnostics(decodedSomaFmRef.current),
      });
      return {
        ok: true,
        status: capabilities.programmaticVolume ? "volume_set" : "volume_saved_external_stream",
        volume,
        source,
        applied: capabilities.programmaticVolume,
        externalStream: capabilities.externalStream,
        state: stateRef.current,
      };
    },
    [activeMusicGainSource, applySourceVolume, clearReleaseTimer, logClientEvent, patchState, scheduleManualVolumeSettle],
  );

  const handleMusicControl = useCallback(
    async (args: MusicControlArgs) => {
      if (!stateRef.current.controlEnabled) return { ok: false, error: "music_control_disabled" };
      const settings = await loadMusicSettings().catch(() => settingsRef.current);
      const source = normalizeMusicSource(args.source, stateRef.current.source || settings?.defaultSource || "somafm");
      const action = String(args.action || "");

      if (action === "play" || action === "start") {
        patchState({ mode: "on", source });
        const result = (await ensureSourcePlaying(source, args)) as Record<string, unknown>;
        return { ...result, state: stateRef.current };
      }
      if (action === "stop") {
        patchState({ mode: "off" });
        stopMusic();
        return { ok: true, status: "stopped", state: stateRef.current };
      }
      if (action === "pause") {
        stopMusic();
        return { ok: true, status: "paused", state: stateRef.current };
      }
      if (action === "resume") {
        const currentSource = stateRef.current.source || source;
        if (stateRef.current.mode === "off") patchState({ mode: "on" });
        const result = (await ensureSourcePlaying(currentSource, args)) as Record<string, unknown>;
        return { ...result, status: result.ok === false ? result.status || "resume_failed" : "resumed", state: stateRef.current };
      }
      if (action === "next" || action === "previous") {
        const direction = action === "previous" ? "previous" : "next";
        patchState({ mode: "on", source });
        const result =
          source === "library"
            ? ((await ensureLibraryTrack(direction)) as Record<string, unknown>)
            : source === "somafm"
              ? ((await playAdjacentSomaChannel(direction)) as Record<string, unknown>)
              : ((await ensureGeneratedTrack(stateRef.current.desiredStyle, true)) as Record<string, unknown>);
        return { ...result, status: result.ok === false ? result.status || `${direction}_failed` : `${direction}_started`, state: stateRef.current };
      }
      if (action === "set_source") {
        patchState({ source });
        if (stateRef.current.mode === "on" || (stateRef.current.mode === "auto" && stateRef.current.agentBusy)) {
          const result = (await ensureSourcePlaying(source, args)) as Record<string, unknown>;
          if (result.ok === false) return { ...result, status: result.status || "source_set_playback_failed", source, state: stateRef.current };
        }
        return { ok: true, status: "source_set", source, state: stateRef.current };
      }
      if (action === "set_channel") {
        const channelId = normalizeChannelId(args.channel_id) || (await findSomaChannelByQuery(args.query));
        if (!channelId) return { ok: false, error: "channel_required" };
        patchState({ mode: "on", source: "somafm" });
        const result = (await ensureSomaFmChannel(channelId)) as Record<string, unknown>;
        return { ...result, status: result.ok === false ? result.status || "channel_playback_failed" : "channel_set", channel_id: channelId, state: stateRef.current };
      }
      if (action === "set_style") {
        if (!args.style) return { ok: false, error: "style_required" };
        const style = normalizeStyle(args.style);
        const operatorRequest = normalizeOperatorRequest(args.operator_request || args.query || args.style);
        const reference = generatedReferenceFromItem(stateRef.current.currentItem);
        const preserveCurrent = args.preserve_current === true || wantsPreserveCurrent(operatorRequest);
        patchState({ mode: "on", source: "ace-step", desiredStyle: style });
        const result = (await ensureGeneratedTrack(style, true, {
          operatorRequest,
          preserveCurrent,
          ...reference,
        })) as Record<string, unknown>;
        return { ...result, status: result.ok === false ? result.status || "style_generation_failed" : "style_set_generation_started", state: stateRef.current };
      }
      if (action === "set_volume") {
        return await setMusicVolume(musicControlVolumeArgToUserVolume(args.volume), "voice_control");
      }
      if (action === "set_mode") {
        const mode = String(args.mode || "");
        if (mode !== "off" && mode !== "auto" && mode !== "on") return { ok: false, error: "mode_required" };
        patchState({ mode });
        if (mode === "off") stopMusic();
        if (mode === "on" || (mode === "auto" && stateRef.current.agentBusy)) {
          const result = (await ensureSourcePlaying(source, args)) as Record<string, unknown>;
          if (result.ok === false) return { ...result, status: result.status || "mode_set_playback_failed", state: stateRef.current };
        }
        recomputeDucking(false);
        return { ok: true, status: "mode_set", state: stateRef.current };
      }
      if (action === "repeat_all") {
        libraryRepeatAllRef.current = args.repeat !== false;
        return { ok: true, status: "repeat_all_set", enabled: libraryRepeatAllRef.current, state: stateRef.current };
      }
      return { ok: false, error: "unknown_music_action", action };
    },
    [
      ensureGeneratedTrack,
      ensureLibraryTrack,
      ensureSomaFmChannel,
      ensureSourcePlaying,
      findSomaChannelByQuery,
      loadMusicSettings,
      patchState,
      playAdjacentSomaChannel,
      recomputeDucking,
      setMusicVolume,
      stopMusic,
    ],
  );

  useEffect(() => {
    const enabled = stateRef.current.controlEnabled;
    const agentBusy = enabled ? codexTasks.some(taskIsBusy) : false;
    const wasBusy = lastAutoBusyRef.current;
    lastAutoBusyRef.current = agentBusy;
    if (stateRef.current.agentBusy !== agentBusy) patchState({ agentBusy });
    if (!enabled) return;
    if (stateRef.current.mode === "auto" && agentBusy && !wasBusy) {
      void loadMusicSettings()
        .then((settings) => ensureSourcePlaying(stateRef.current.source || settings.defaultSource))
        .catch(() => undefined);
    }
    if (stateRef.current.mode === "auto" && !agentBusy) {
      recomputeDucking(true);
    }
  }, [codexTasks, ensureSourcePlaying, loadMusicSettings, patchState, recomputeDucking]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
      if (releaseTimerRef.current !== null) window.clearTimeout(releaseTimerRef.current);
      if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
      if (userSpeechFallbackTimerRef.current !== null) window.clearTimeout(userSpeechFallbackTimerRef.current);
      for (const timer of volumeSettleTimerRefs.current) window.clearTimeout(timer);
      if (analyserFrameRef.current !== null) window.cancelAnimationFrame(analyserFrameRef.current);
      const decoded = decodedSomaFmRef.current;
      if (decoded) {
        decoded.active = false;
        decoded.abortController.abort();
        if (decoded.sourceVolumeTimer !== null) window.clearInterval(decoded.sourceVolumeTimer);
        if (decoded.duckingTimer !== null) window.clearInterval(decoded.duckingTimer);
        try {
          decoded.decoder?.free();
          decoded.sourceGain.disconnect();
          decoded.duckingGain.disconnect();
          decoded.analyser.disconnect();
        } catch {
          // best-effort cleanup
        }
      }
      const slots = slotsRef.current;
      if (slots) {
        for (const slot of slots) {
          if (slot.sourceVolumeTimer !== null && slot.sourceVolumeTimer !== undefined) window.clearInterval(slot.sourceVolumeTimer);
          if (slot.duckingTimer !== null && slot.duckingTimer !== undefined) window.clearInterval(slot.duckingTimer);
          slot.audio.pause();
        }
      }
      void musicAudioContextRef.current?.close().catch(() => undefined);
      void assistantAudioContextRef.current?.close().catch(() => undefined);
    };
  }, []);

  return {
    ...state,
    setControlEnabled,
    setMusicVolume,
    handleMusicControl,
    attachAssistantStream,
    onUserSpeechStart,
    onUserSpeechStop,
  };
}
