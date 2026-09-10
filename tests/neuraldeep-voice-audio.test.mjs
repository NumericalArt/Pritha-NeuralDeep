import test from "node:test";
import assert from "node:assert/strict";
import {
  chainedInputGain,
  normalizeVoiceSamples,
} from "../scripts/neuraldeep/voice-audio.mjs";

const rms = (samples) =>
  Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
test("NeuralDeep input level retains quiet speech and honors zero and full scale", () => {
  assert.equal(chainedInputGain(53), 0.53);
  assert.equal(chainedInputGain(0), 0);
  assert.equal(chainedInputGain(100), 1);
  assert.equal(chainedInputGain(-1), 0);
  assert.equal(chainedInputGain(150), 1);
});
test("VAD-accepted quiet speech passes the server RMS gate without clipping or changing its shape", () => {
  const samples = Float32Array.from(
    { length: 16000 },
    (_, i) => 0.004 * Math.sin(i / 20),
  );
  const before = samples.slice();
  const result = normalizeVoiceSamples(samples);
  assert.ok(rms(samples) < 0.003);
  assert.ok(rms(result) > 0.003);
  assert.ok(rms(result) / rms(samples) <= 8.000001);
  assert.deepEqual(
    samples,
    before,
    "normalization must not mutate a retained draft",
  );
  for (let i = 0; i < samples.length; i++)
    assert.ok(Math.abs(result[i] - samples[i] * 8) < 1e-7);
});
test("normalization preserves silence and does not amplify normal input or clip peaks", () => {
  for (const value of [0, 0.00001, 0.2]) {
    const samples = new Float32Array(100).fill(value);
    assert.strictEqual(normalizeVoiceSamples(samples), samples);
  }
  const transient = new Float32Array(16000).fill(0.001);
  transient[100] = 0.8;
  const out = normalizeVoiceSamples(transient);
  assert.ok(Math.max(...out) <= 0.900001);
  assert.throws(
    () => normalizeVoiceSamples(new Float32Array([NaN])),
    /invalid_sample/,
  );
});
