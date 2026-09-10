"use client";
import type { MicVAD } from "@ricky0123/vad-web";
import { normalizeVoiceSamples } from "../../../../../scripts/neuraldeep/voice-audio.mjs";
export type VoiceCaptureStats = {
  frames: number;
  rms: number;
  speechProbability: number;
  speechActive: boolean;
  audioContextState: string;
  sampleRate: number;
  paused: boolean;
  stalled: boolean;
};
export interface VoiceEventChannel {
  readonly readyState: string;
  send(data: string): void;
  close(): void;
}
type ToolItem = {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
};
type Options = {
  signal: AbortSignal;
  sessionId: string;
  stream: MediaStream;
  audioContext: AudioContext;
  onEvent: (json: string) => void;
  onTool: (
    item: ToolItem,
    output?: Record<string, unknown>,
  ) => Promise<unknown>;
  onPhase: (phase: "listening" | "working" | "speaking") => void;
  onDraft: (ready: boolean) => void;
  onAssistantStream: (stream: MediaStream) => void;
  onLatency: (ms: number) => void;
  onMuted: (muted: boolean) => void;
  onDisconnected: () => void;
  onCapture?: (stats: VoiceCaptureStats) => void;
};
type Event = {
  id: number;
  type: string;
  turnId?: string;
  [key: string]: unknown;
};
function rememberTurn(turns: Set<string>, id: string) {
  turns.add(id);
  if (turns.size > 128) turns.delete(turns.values().next().value!);
}
function wav(samples: Float32Array) {
  const buffer = new ArrayBuffer(44 + samples.length * 2),
    view = new DataView(buffer),
    write = (offset: number, value: string) => {
      for (let i = 0; i < value.length; i++)
        view.setUint8(offset + i, value.charCodeAt(i));
    };
  write(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++)
    view.setInt16(
      44 + i * 2,
      Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))),
      true,
    );
  return buffer;
}
export class NeuralDeepVoiceTransport implements VoiceEventChannel {
  readyState = "connecting";
  private vad: MicVAD | null = null;
  private events: EventSource | null = null;
  private muted = false;
  private closing = false;
  private commands: Promise<unknown> = Promise.resolve();
  private source: AudioBufferSourceNode | null = null;
  private output: MediaStreamAudioDestinationNode;
  private playbackGeneration = 0;
  private audio: Array<{ id: string; turnId: string }> = [];
  private playing = false;
  private completed = new Set<string>();
  private cancelled = new Set<string>();
  private currentTurn = "";
  private lastEvent = 0;
  private toolResults = new Map<string, Promise<unknown>>();
  private startedAt = 0;
  private firstAudio = false;
  private draft: Float32Array | null = null;
  private capped = false;
  private speechSamples = 0;
  private inSpeech = false;
  private pendingText: string[] = [];
  private captureTimer: ReturnType<typeof setInterval> | null = null;
  private captureFrames = 0;
  private captureRms = 0;
  private captureProbability = 0;
  private lastCaptureFrameAt = 0;
  private hidden = () => {
    if (document.visibilityState === "hidden" && !this.closing) {
      void this.setMuted(true);
      this.options.onMuted(true);
      this.interrupt();
    }
  };
  private constructor(private options: Options) {
    this.output = options.audioContext.createMediaStreamDestination();
    options.signal.addEventListener("abort", () => this.close(), {
      once: true,
    });
  }
  static async create(options: Options) {
    const transport = new NeuralDeepVoiceTransport(options);
    try {
      await transport.connect();
      return transport;
    } catch (error) {
      transport.close();
      throw error;
    }
  }
  private base(path: string) {
    return `/api/voice/sessions/${this.options.sessionId}/${path}`;
  }
  private emit(type: string, payload: Record<string, unknown> = {}) {
    this.options.onEvent(JSON.stringify({ type, ...payload }));
  }
  private fail(code = "voice_connection_failed") {
    if (this.closing) return;
    this.emit("error", {
      error: {
        code,
        message:
          code === "voice_no_speech"
            ? "Речь не распознана. Попробуйте ещё раз."
            : "Голосовой ответ прерван. Проверьте карточки задач перед повтором команды.",
      },
    });
    this.finish();
  }
  private finish() {
    this.options.onPhase("listening");
    this.emit("response.done", { response: { output: [] } });
  }
  private enqueue(work: () => Promise<unknown>) {
    this.commands = this.commands
      .then(() => {
        if (!this.closing) return work();
      })
      .catch(() => this.fail());
  }
  private async post(path: string, body: unknown = {}) {
    const response = await fetch(this.base(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(35000),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok)
      throw new Error(payload.error || "voice_request_failed");
    return payload;
  }
  private async connect() {
    this.options.signal.throwIfAborted();
    await this.options.audioContext.resume();
    this.options.signal.throwIfAborted();
    this.options.onAssistantStream(this.output.stream);
    const events = new EventSource(this.base("events"));
    this.events = events;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("voice_events_timeout")),
        8000,
      );
      events.onopen = () => {
        clearTimeout(timer);
        if (this.vad) this.readyState = "open";
        resolve();
      };
      events.onerror = () => {
        clearTimeout(timer);
        reject(new Error("voice_events_unavailable"));
      };
      events.onmessage = (event) =>
        this.handle(JSON.parse(event.data) as Event);
    });
    events.onerror = () => {
      if (this.closing) return;
      this.readyState = "connecting";
      void this.setMuted(true);
      this.options.onMuted(true);
      this.interrupt();
      if (events.readyState === EventSource.CLOSED) {
        this.fail();
        this.close();
        this.options.onDisconnected();
      }
    };
    const { MicVAD } = await import("@ricky0123/vad-web");
    this.options.signal.throwIfAborted();
    this.vad = await MicVAD.new({
      model: "v5",
      baseAssetPath: "/voice-vad/",
      onnxWASMBasePath: "/voice-vad/",
      audioContext: this.options.audioContext,
      startOnLoad: false,
      positiveSpeechThreshold: 0.5,
      negativeSpeechThreshold: 0.35,
      redemptionMs: 600,
      preSpeechPadMs: 256,
      minSpeechMs: 96,
      submitUserSpeechOnPause: false,
      ortConfig: (ort) => {
        ort.env.wasm.numThreads = 1;
      },
      getStream: async () => this.options.stream,
      pauseStream: async () => {},
      resumeStream: async () => this.options.stream,
      onSpeechStart: () => {
        if (this.muted) return;
        this.inSpeech = true;
        this.speechSamples = 0;
        this.emit("input_audio_buffer.speech_started");
        this.interrupt();
      },
      onFrameProcessed: (probabilities, frame) => {
        this.captureFrames++;
        this.lastCaptureFrameAt = performance.now();
        const rms = Math.sqrt(
          frame.reduce((sum, value) => sum + value * value, 0) / frame.length,
        );
        this.captureRms = Math.max(this.captureRms, rms);
        this.captureProbability = Math.max(
          this.captureProbability,
          probabilities.isSpeech,
        );
        if (this.inSpeech && !this.capped) {
          this.speechSamples += frame.length;
          if (this.speechSamples >= 16000 * 119.5) {
            this.capped = true;
            this.vad?.setOptions({ submitUserSpeechOnPause: true });
            void this.vad?.pause();
          }
        }
      },
      onVADMisfire: () => {
        this.inSpeech = false;
        this.emit("input_audio_buffer.speech_stopped");
      },
      onSpeechEnd: (samples) => {
        this.inSpeech = false;
        this.emit("input_audio_buffer.speech_stopped");
        if (this.closing || this.muted) return;
        if (this.capped) {
          this.draft = samples.slice(0, 16000 * 120);
          this.options.onDraft(true);
          this.vad?.setOptions({ submitUserSpeechOnPause: false });
          return;
        }
        this.submitAudio(samples);
      },
    });
    if (this.closing) {
      await this.vad.destroy();
      return;
    }
    document.addEventListener("visibilitychange", this.hidden);
    for (const track of this.options.stream.getAudioTracks())
      track.addEventListener(
        "ended",
        () => {
          if (!this.closing) {
            this.fail();
            this.close();
            this.options.onDisconnected();
          }
        },
        { once: true },
      );
    this.readyState = "open";
    await this.vad.start();
    if (this.closing) return;
    this.lastCaptureFrameAt = performance.now();
    this.captureTimer = setInterval(() => {
      this.options.onCapture?.({
        frames: this.captureFrames,
        rms: Number(this.captureRms.toFixed(6)),
        speechProbability: Number(this.captureProbability.toFixed(3)),
        speechActive: this.inSpeech,
        audioContextState: this.options.audioContext.state,
        sampleRate: this.options.audioContext.sampleRate,
        paused: this.muted || Boolean(this.draft),
        stalled:
          !this.muted &&
          !this.draft &&
          performance.now() - this.lastCaptureFrameAt > 5000,
      });
      this.captureRms = 0;
      this.captureProbability = 0;
    }, 1000);
    this.options.onPhase("listening");
  }
  sendUserText(text: string) {
    if ([...this.pendingText, text].join("\n").length > 16000) return false;
    this.pendingText.push(text);
    return true;
  }
  send(data: string) {
    const event = JSON.parse(data);
    if (event.type === "session.update") {
      const enabled = (event.session?.tools || []).some(
        (t: { name: string }) => t.name === "music_control",
      );
      this.enqueue(() =>
        this.post("context", { musicControlEnabled: enabled }),
      );
    }
    if (
      event.type === "conversation.item.create" &&
      event.item?.type === "message"
    ) {
      const text = (event.item.content || [])
        .map((c: { text?: string }) => c.text || "")
        .join("\n");
      this.enqueue(() =>
        this.post("context", {
          text: text.slice(0, 3500),
          reset: text.startsWith("Reset Sticky Voice Context"),
        }),
      );
    }
    if (event.type === "response.create") {
      const text = this.pendingText.splice(0).join("\n");
      this.enqueue(() =>
        this.submitText(
          text ||
            "Respond briefly to the latest session update. Use tools only if the operator explicitly requested an action.",
          !text,
        ),
      );
    }
    if (event.type === "response.cancel") this.interrupt();
  }
  private async submitText(text: string, hostNotification: boolean) {
    const id = crypto.randomUUID();
    this.currentTurn = id;
    this.startedAt = performance.now();
    this.firstAudio = false;
    try {
      await this.post("turns", { clientTurnId: id, text, hostNotification });
    } catch (error) {
      if (!(await this.reconcileTurn(id))) throw error;
    }
  }
  private async reconcileTurn(id: string) {
    try {
      const response = await fetch(this.base(`turns/${id}`), {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      const payload = await response.json();
      return response.ok && payload.ok && Boolean(payload.turn);
    } catch {
      return false;
    }
  }
  private submitAudio(samples: Float32Array) {
    const bytes = wav(normalizeVoiceSamples(samples));
    this.enqueue(async () => {
      const id = crypto.randomUUID();
      this.currentTurn = id;
      this.startedAt = performance.now();
      this.firstAudio = false;
      try {
        const response = await fetch(this.base("turns"), {
          method: "POST",
          headers: { "Content-Type": "audio/wav", "X-Voice-Turn-Id": id },
          body: bytes,
          signal: AbortSignal.timeout(35000),
        });
        if (!response.ok) throw new Error("voice_audio_upload_failed");
      } catch (error) {
        if (!(await this.reconcileTurn(id))) throw error;
      }
    });
  }
  interrupt() {
    if (this.currentTurn) rememberTurn(this.cancelled, this.currentTurn);
    this.playbackGeneration++;
    this.source?.stop();
    this.source = null;
    this.audio = [];
    this.enqueue(() => this.post("interrupt"));
  }
  async setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      this.inSpeech = false;
      await this.vad?.pause();
      this.emit("input_audio_buffer.speech_stopped");
    } else if (!this.draft) {
      this.lastCaptureFrameAt = performance.now();
      await this.options.audioContext.resume();
      await this.vad?.start();
    }
  }
  async resolveDraft(send: boolean) {
    const draft = this.draft;
    this.draft = null;
    this.capped = false;
    this.options.onDraft(false);
    if (send && draft) this.submitAudio(draft);
    if (!this.muted) await this.vad?.start();
  }
  private handle(event: Event) {
    if (this.closing || event.id <= this.lastEvent) return;
    this.lastEvent = event.id;
    if (this.toolResults.size >= 128) {
      const oldest = this.toolResults.keys().next().value;
      if (oldest) this.toolResults.delete(oldest);
    }
    const turn = String(event.turnId || "");
    if (event.type === "tool.result") {
      if (
        !event.output ||
        typeof event.output !== "object" ||
        Array.isArray(event.output)
      ) {
        this.fail("voice_tool_result_invalid");
        return;
      }
      const id = String(event.operationId);
      if (!this.toolResults.has(id)) {
        const promise = this.options.onTool(
          {
            type: "function_call",
            call_id: id,
            name: String(event.name),
            arguments: JSON.stringify(event.arguments),
          },
          event.output as Record<string, unknown>,
        );
        this.toolResults.set(id, promise);
        void promise.catch(() => this.fail());
      }
      return;
    }
    if (
      event.type === "session.resync_required" ||
      event.type === "session.closed"
    ) {
      this.fail();
      this.close();
      this.options.onDisconnected();
      return;
    }
    if (this.cancelled.has(turn) && event.type !== "turn.interrupted") return;
    if (event.type === "turn.accepted") {
      this.emit("response.created");
      this.options.onPhase("working");
    }
    if (event.type === "turn.phase") this.options.onPhase("working");
    if (event.type === "transcript.user")
      this.emit("conversation.item.input_audio_transcription.completed", {
        transcript: event.text,
      });
    if (event.type === "transcript.assistant")
      this.emit("response.output_text.done", { text: event.text });
    if (event.type === "audio.segment") {
      this.audio.push({ id: String(event.audioId), turnId: turn });
      void this.play();
    }
    if (event.type === "turn.completed") {
      rememberTurn(this.completed, turn);
      if (!this.playing && !this.audio.length) this.finish();
    }
    if (event.type === "turn.interrupted") {
      rememberTurn(this.cancelled, turn);
      if (this.currentTurn === turn) this.finish();
    }
    if (event.type === "turn.error") this.fail(String(event.code));
    if (event.type === "tool.browser_request") {
      const id = String(event.operationId);
      let result = this.toolResults.get(id);
      if (!result) {
        result = this.options.onTool({
          type: "function_call",
          call_id: id,
          name: String(event.name),
          arguments: JSON.stringify(event.arguments),
        });
        this.toolResults.set(id, result);
      }
      void result
        .then((output) =>
          this.post("browser-results", { operationId: id, result: output }),
        )
        .catch(() => this.fail());
    }
  }
  private async play() {
    if (this.playing || this.closing) return;
    this.playing = true;
    const generation = this.playbackGeneration;
    try {
      while (
        this.audio.length &&
        generation === this.playbackGeneration &&
        !this.closing
      ) {
        const next = this.audio.shift()!;
        if (this.cancelled.has(next.turnId)) continue;
        const response = await fetch(this.base(`audio/${next.id}`), {
          cache: "no-store",
          signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) throw new Error("voice_audio_expired");
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > 4 * 1024 * 1024)
          throw new Error("voice_audio_limit");
        const audio = await this.options.audioContext.decodeAudioData(bytes);
        if (generation !== this.playbackGeneration || this.closing) break;
        await this.options.audioContext.resume();
        const source = this.options.audioContext.createBufferSource();
        source.buffer = audio;
        source.connect(this.options.audioContext.destination);
        source.connect(this.output);
        this.source = source;
        this.options.onPhase("speaking");
        if (!this.firstAudio) {
          this.options.onLatency(
            Math.round(performance.now() - this.startedAt),
          );
          this.firstAudio = true;
        }
        await new Promise<void>((resolve) => {
          source.onended = () => {
            source.disconnect();
            resolve();
          };
          source.start();
        });
        if (this.source === source) this.source = null;
      }
    } catch {
      if (generation === this.playbackGeneration && !this.closing)
        this.fail("voice_playback_failed");
    } finally {
      this.playing = false;
      if (this.audio.length) void this.play();
      else if (this.completed.has(this.currentTurn)) this.finish();
    }
  }
  close() {
    if (this.closing) return;
    this.closing = true;
    if (this.captureTimer) clearInterval(this.captureTimer);
    this.captureTimer = null;
    document.removeEventListener("visibilitychange", this.hidden);
    this.readyState = "closed";
    this.events?.close();
    this.playbackGeneration++;
    this.source?.stop();
    this.source = null;
    this.audio = [];
    this.draft = null;
    this.options.onDraft(false);
    void this.vad?.destroy();
    this.output.disconnect();
    void fetch(`/api/voice/sessions/${this.options.sessionId}`, {
      method: "DELETE",
      keepalive: true,
    }).catch(() => {});
  }
}
