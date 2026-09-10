import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, webkit } from "playwright-core";
import { validateVoiceWav } from "../../../scripts/neuraldeep/voice-provider.mjs";

// Real AudioWorklet + pinned Silero inference; only the microphone is synthetic.
const base = process.env.PRITHA_VOICE_E2E_BASE_URL;
if (
  !base ||
  new URL(base).hostname !== "127.0.0.1" ||
  !new URL(base).port ||
  ["3420", "7420"].includes(new URL(base).port)
)
  throw new Error(
    "Set PRITHA_VOICE_E2E_BASE_URL to an isolated loopback candidate, never production.",
  );
const clip = readFileSync(
  new URL(
    "../../../tests/fixtures/neuraldeep/voice-input-en.wav",
    import.meta.url,
  ),
).toString("base64");
const headers = {
  Origin: new URL(base).origin,
  "Content-Type": "application/json",
};
const patch = async (body) => {
  const response = await fetch(base + "/api/realtime/runtime-settings", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200);
};

for (const [name, engine] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  test(`${name}: quiet spoken input at 53%, zero, mute, signal health and cleanup`, async (t) => {
    const original = await (
      await fetch(base + "/api/realtime/runtime-settings")
    ).json();
    const browser = await engine.launch({ headless: true });
    const page = await browser.newPage({
      viewport:
        name === "webkit"
          ? { width: 390, height: 844 }
          : { width: 1440, height: 1000 },
    });
    const uploads = [],
      errors = [],
      diagnostics = [],
      responses = [];
    try {
      await patch({ voiceTransport: "neuraldeep_chained" });
      await page.addInitScript(() => {
        localStorage.setItem("pritha.voice.inputLevel.v1", "53");
        window.__capture = { contexts: [], streams: [], events: [], gains: [] };
        const NativeContext = window.AudioContext;
        window.AudioContext = class extends NativeContext {
          constructor(...args) {
            super(...args);
            window.__capture.contexts.push(this);
          }
          createGain() {
            const gain = super.createGain();
            window.__capture.gains.push(gain);
            return gain;
          }
        };
        Object.defineProperty(
          Object.getPrototypeOf(navigator.mediaDevices),
          "getUserMedia",
          {
            configurable: true,
            value: async (constraints) => {
              window.__capture.constraints = constraints;
              const audio = new AudioContext(),
                destination = audio.createMediaStreamDestination();
              window.__capture.streams.push(destination.stream);
              window.__capture.play = async (base64, volume) => {
                await audio.resume();
                const source = audio.createBufferSource();
                source.buffer = await audio.decodeAudioData(
                  Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer,
                );
                const gain = audio.createGain();
                gain.gain.value = volume;
                source.connect(gain);
                gain.connect(destination);
                source.start();
                source.onended = () => {
                  source.disconnect();
                  gain.disconnect();
                };
                return source.buffer.duration;
              };
              return destination.stream;
            },
          },
        );
        const NativeEvents = window.EventSource;
        window.EventSource = class extends NativeEvents {
          constructor(...args) {
            super(...args);
            this.addEventListener("message", (e) =>
              window.__capture.events.push(JSON.parse(e.data)),
            );
          }
        };
      });
      let live = false;
      await page.route("**/api/voice/sessions/*/turns", async (route) => {
        if (route.request().headers()["content-type"] !== "audio/wav")
          return route.continue();
        const bytes = route.request().postDataBuffer();
        uploads.push({ bytes: bytes.length, ...validateVoiceWav(bytes) });
        if (live) return route.continue();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: '{"ok":true}',
        });
      });
      page.on("request", (request) => {
        if (
          request.url().endsWith("/api/realtime/event") &&
          request.method() === "POST"
        ) {
          const data = request.postDataJSON();
          if (data.kind === "voice_capture_state")
            diagnostics.push(data.payload);
        }
      });
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("response", (response) => {
        if (response.url().endsWith("/turns"))
          responses.push({ status: response.status() });
      });
      await page.goto(base + "/voice");
      await page
        .getByRole("button", { name: "Start Listening", exact: true })
        .click();
      await page
        .getByText("NeuralDeep voice connected · experimental", { exact: true })
        .filter({ visible: true })
        .waitFor({ timeout: 20000 });
      const meter = page
        .getByRole("meter", { name: "Microphone signal" })
        .filter({ visible: true });
      await meter.waitFor();
      assert.deepEqual(
        await page.evaluate(() => window.__capture.constraints.audio),
        {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      );
      const play = async (volume) => {
        console.log(`${name}: playing fixture at volume ${volume}`);
        const seconds = await page.evaluate(
          ({ clip, volume }) => window.__capture.play(clip, volume),
          { clip, volume },
        );
        await page.waitForTimeout(seconds * 1000 + 1800); // End-of-speech window + audio worklet scheduling.
      };
      await play(0);
      assert.equal(uploads.length, 0, "silence must not produce a turn");
      await page.getByRole("button", { name: "Mute", exact: true }).click();
      await play(1);
      assert.equal(uploads.length, 0, "mute must suppress actual speech");
      await page
        .getByText("Microphone paused", { exact: true })
        .filter({ visible: true })
        .waitFor();
      await page.getByRole("button", { name: "Unmute", exact: true }).click();
      const slider = page
        .getByRole("slider", { name: "Voice input level", exact: true })
        .filter({ visible: true });
      const level = (value) =>
        slider.evaluate((element, value) => {
          Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
          ).set.call(element, value);
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        }, String(value));
      await level(0);
      await play(1);
      assert.equal(
        uploads.length,
        0,
        "zero input level must suppress actual speech",
      );
      await level(53);
      await play(0.03);
      assert.ok(
        uploads.length > 0,
        "quiet speech at 53% must reach the server",
      );
      assert.ok(
        uploads.every((upload) => upload.rms >= 0.003),
        "accepted speech must pass the server RMS gate",
      );
      const quietUploads = uploads.length;
      await level(100);
      await play(1);
      assert.ok(uploads.length > quietUploads, "full input must still work");
      assert.ok(
        diagnostics.some(
          (d) => d.frames > 0 && d.audioContextState === "running",
        ),
        "capture diagnostics must distinguish incoming frames",
      );
      await page.evaluate(() => window.__capture.contexts[0].suspend());
      await page
        .getByText("Audio capture stalled — reconnect", { exact: true })
        .filter({ visible: true })
        .waitFor({ timeout: 8000 });
      await page.evaluate(() => window.__capture.contexts[0].resume());

      if (process.env.PRITHA_VOICE_E2E_LIVE === "1") {
        // Start the live acceptance with the same quiet input as a fresh user connection.
        // Silero's persistent state adapts to the preceding 30 dB fixture jump.
        await page
          .getByRole("button", { name: "Stop Listening", exact: true })
          .click();
        await level(53);
        await page
          .getByRole("button", { name: "Start Listening", exact: true })
          .click();
        await page
          .getByText("NeuralDeep voice connected · experimental", {
            exact: true,
          })
          .filter({ visible: true })
          .waitFor({ timeout: 20000 });
        await meter.waitFor(); // The retained status text alone does not prove the new capture is ready.
        live = true;
        const beforeLive = uploads.length;
        await play(0.03);
        assert.ok(
          uploads.length > beforeLive,
          "fresh quiet speech must be uploaded to STT",
        );
        assert.equal(
          responses.at(-1)?.status,
          200,
          "live WAV upload must be accepted",
        );
        await page.waitForFunction(
          () =>
            window.__capture.events.some(
              (e) => e.type === "turn.completed" || e.type === "turn.error",
            ),
          {},
          { timeout: 60000 },
        );
        const events = await page.evaluate(() => window.__capture.events);
        assert.equal(
          events.find((e) => e.type === "turn.error")?.code,
          undefined,
          "live provider must complete the voice turn",
        );
        assert.ok(
          events.some((e) => e.type === "transcript.user" && e.text),
          "actual STT must recognize speech",
        );
        assert.ok(
          events.some((e) => e.type === "transcript.assistant" && e.text),
          "LLM must reply",
        );
        assert.ok(
          events.some((e) => e.type === "audio.segment"),
          "TTS must return audio",
        );
        assert.equal(
          events.some((e) => e.type === "tool.result"),
          false,
          "greeting fixture must not execute tools",
        );
      }
      await page
        .getByRole("button", { name: "Stop Listening", exact: true })
        .click();
      await meter.waitFor({ state: "hidden" });
      const count = diagnostics.length;
      await page.waitForTimeout(1100);
      assert.equal(
        diagnostics.length,
        count,
        "closed capture must stop its reporting timer",
      );
      assert.ok(
        await page.evaluate(() =>
          window.__capture.streams.every((s) =>
            s.getTracks().every((t) => t.readyState === "ended"),
          ),
        ),
      );
      assert.deepEqual(errors, []);
      t.diagnostic(
        JSON.stringify({ uploads, diagnostics: diagnostics.length, live }),
      );
    } catch (error) {
      console.log(
        JSON.stringify({
          name,
          uploads,
          diagnostics,
          responses,
          gains: await page.evaluate(() =>
            window.__capture.gains.map((g) => g.gain.value),
          ),
          events: await page
            .evaluate(() =>
              window.__capture?.events.map((e) => ({
                type: e.type,
                code: e.code,
                turnId: e.turnId,
              })),
            )
            .catch(() => []),
        }),
      );
      throw error;
    } finally {
      const stop = page.getByRole("button", {
        name: "Stop Listening",
        exact: true,
      });
      if (await stop.count()) await stop.click().catch(() => {});
      await browser.close();
      await patch({
        voiceTransport: original.settings.voiceTransport,
        neuraldeepVoice: original.settings.neuraldeepVoice,
      });
    }
  });
}

test("chromium: native getUserMedia capture reaches VAD and WAV upload", async () => {
  const original = await (
    await fetch(base + "/api/realtime/runtime-settings")
  ).json();
  const directory = mkdtempSync(path.join(tmpdir(), "pritha-synthetic-voice-"));
  // Chromium loops fake microphone files. Include an actual pause so VAD can end a turn.
  const input = Buffer.from(clip, "base64");
  let format, data;
  for (let offset = 12; offset + 8 <= input.length;) {
    const length = input.readUInt32LE(offset + 4),
      id = input.toString("ascii", offset, offset + 4);
    if (id === "fmt ") format = input.subarray(offset + 8, offset + 24);
    if (id === "data") data = input.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length + (length % 2);
  }
  const wav = Buffer.alloc(44 + data.length + 64000);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  format.copy(wav, 20);
  wav.write("data", 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  data.copy(wav, 44);
  const fixture = path.join(directory, "speech-with-pause.wav");
  writeFileSync(fixture, wav);
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${fixture}`,
    ],
  });
  const page = await browser.newPage();
  const uploads = [];
  try {
    await patch({ voiceTransport: "neuraldeep_chained" });
    await page.route("**/api/voice/sessions/*/turns", async (route) => {
      if (route.request().headers()["content-type"] !== "audio/wav")
        return route.continue();
      uploads.push(validateVoiceWav(route.request().postDataBuffer()));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"ok":true}',
      });
    });
    await page.goto(base + "/voice");
    await page
      .getByRole("button", { name: "Start Listening", exact: true })
      .click();
    await page
      .getByRole("meter", { name: "Microphone signal" })
      .filter({ visible: true })
      .waitFor({ timeout: 20000 });
    await page.waitForTimeout(8500);
    assert.ok(
      uploads.length > 0,
      "native browser microphone path must submit detected speech after a pause",
    );
    assert.ok(uploads.every((upload) => upload.rms >= 0.003));
  } finally {
    const stop = page.getByRole("button", {
      name: "Stop Listening",
      exact: true,
    });
    if (await stop.count()) await stop.click().catch(() => {});
    await browser.close();
    rmSync(directory, { recursive: true, force: true });
    await patch({
      voiceTransport: original.settings.voiceTransport,
      neuraldeepVoice: original.settings.neuraldeepVoice,
    });
  }
});
