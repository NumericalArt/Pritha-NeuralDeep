import test from "node:test";
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright-core";
const base = process.env.PRITHA_VOICE_E2E_BASE_URL;
if (
  !base ||
  !["127.0.0.1", "localhost"].includes(new URL(base).hostname) ||
  !new URL(base).port ||
  new URL(base).port === "3420"
)
  throw new Error(
    "Set PRITHA_VOICE_E2E_BASE_URL to an isolated loopback candidate, never production.",
  );
const headers = {
  "Content-Type": "application/json",
  Origin: new URL(base).origin,
};
const settings = async (patch) => {
  const r = await fetch(`${base}/api/realtime/runtime-settings`, {
    method: "POST",
    headers,
    body: JSON.stringify(patch),
  });
  assert.equal(r.status, 200);
  return r.json();
};
for (const [name, engine] of [
  ["chromium", chromium],
  ["webkit", webkit],
])
  test(`${name}: self-hosted VAD, settings snapshot, mute and complete cleanup`, async () => {
    const original = await (
      await fetch(`${base}/api/realtime/runtime-settings`)
    ).json();
    const browser = await engine.launch({ headless: true });
    let page;
    try {
      await settings({ voiceTransport: "neuraldeep_chained" });
      const context = await browser.newContext();
      await context.addInitScript(() => {
        window.__voiceFixture = { streams: [], contexts: [], events: [] };
        // Patch the prototype: WebKit can recreate a MediaDevices wrapper.
        Object.defineProperty(
          Object.getPrototypeOf(navigator.mediaDevices),
          "getUserMedia",
          {
            configurable: true,
            value: async () => {
              const audio = new AudioContext(),
                destination = audio.createMediaStreamDestination(),
                source = audio.createConstantSource();
              source.offset.value = 0;
              source.connect(destination);
              source.start();
              window.__voiceFixture.streams.push(destination.stream);
              window.__voiceFixture.contexts.push(audio);
              if (window.__voiceFixture.streams.length === 1)
                await new Promise((resolve) => {
                  window.__voiceFixture.releaseCapture = resolve;
                });
              return destination.stream;
            },
          },
        );
        const Native = window.EventSource;
        window.EventSource = class extends Native {
          constructor(...args) {
            super(...args);
            this.addEventListener("message", (event) => {
              try {
                window.__voiceFixture.events.push(JSON.parse(event.data));
              } catch {}
            });
          }
        };
      });
      page = await context.newPage();
      const errors = [],
        assets = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("response", (r) => {
        if (r.url().includes("/voice-vad/"))
          assets.push({
            name: new URL(r.url()).pathname.split("/").at(-1),
            status: r.status(),
          });
      });
      await page.goto(`${base}/voice`);
      await page
        .getByRole("button", { name: "Start Listening", exact: true })
        .click();
      await page.waitForFunction(() => window.__voiceFixture.releaseCapture);
      await page
        .getByRole("button", { name: "Cancel connection", exact: true })
        .click();
      const deletedSession = page.waitForResponse(
        (r) =>
          r.request().method() === "DELETE" &&
          r.url().includes("/api/voice/sessions/"),
      );
      await page.evaluate(() => window.__voiceFixture.releaseCapture());
      assert.ok((await deletedSession).ok());
      await page.waitForFunction(() =>
        window.__voiceFixture.streams[0]
          .getTracks()
          .every((t) => t.readyState === "ended"),
      );
      assert.equal(
        await page.evaluate(() => window.__voiceFixture.events.length),
        0,
      );
      await page
        .getByRole("button", { name: "Start Listening", exact: true })
        .click();
      await page
        .getByText("NeuralDeep voice connected · experimental", { exact: true })
        .filter({ visible: true })
        .waitFor({ timeout: 20000 });
      await page.getByRole("button", { name: "Mute", exact: true }).click();
      assert.ok(
        assets.some((a) => a.name === "silero_vad_v5.onnx" && a.status === 200),
      );
      assert.ok(
        assets.some((a) => a.name.endsWith(".wasm") && a.status === 200),
      );
      const before = await page.evaluate(
        () =>
          window.__voiceFixture.events.find((e) => e.type === "session.ready")
            .sessionId,
      );
      await settings({ voiceTransport: "openai_realtime" });
      assert.equal(
        await page.evaluate(
          () =>
            window.__voiceFixture.events.find((e) => e.type === "session.ready")
              .sessionId,
        ),
        before,
      );
      if (process.env.PRITHA_VOICE_E2E_LIVE === "1") {
        await page
          .getByPlaceholder(
            "Paste a command, link, screenshot, file, or context.",
          )
          .filter({ visible: true })
          .fill("Say exactly: hello, I am ready to help. Do not use tools.");
        await page
          .getByRole("button", { name: "Send command", exact: true })
          .click();
        await page.waitForFunction(
          () =>
            window.__voiceFixture.events.some(
              (e) => e.type === "turn.completed",
            ),
          {},
          { timeout: 60000 },
        );
        assert.ok(
          await page.evaluate(() =>
            window.__voiceFixture.events.some(
              (e) => e.type === "transcript.assistant" && e.text,
            ),
          ),
        );
        assert.ok(
          await page.evaluate(() =>
            window.__voiceFixture.events.some(
              (e) => e.type === "audio.segment",
            ),
          ),
        );
        assert.equal(
          await page.evaluate(() =>
            window.__voiceFixture.events.some((e) => e.type === "tool.result"),
          ),
          false,
        );
      }
      await page
        .getByRole("button", { name: "Stop Listening", exact: true })
        .click();
      assert.ok(
        await page.evaluate(() =>
          window.__voiceFixture.streams.every((s) =>
            s.getTracks().every((t) => t.readyState === "ended"),
          ),
        ),
      );
      assert.deepEqual(errors, []);
    } finally {
      if (page) {
        const stop = page.getByRole("button", {
          name: "Stop Listening",
          exact: true,
        });
        if (await stop.count()) await stop.click().catch(() => {});
      }
      await browser.close();
      await settings({
        voiceTransport: original.settings.voiceTransport,
        neuraldeepVoice: original.settings.neuraldeepVoice,
      });
    }
  });
