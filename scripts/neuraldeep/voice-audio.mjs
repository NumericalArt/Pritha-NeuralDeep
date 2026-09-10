/** Browser-safe signal helpers; no microphone or provider side effects. */
export function chainedInputGain(level) {
  return Math.max(0, Math.min(100, Number.isFinite(level) ? level : 100)) / 100;
}

/** Normalize only a segment already accepted by VAD; preserve silence and headroom. */
export function normalizeVoiceSamples(samples) {
  let energy = 0,
    peak = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample)) throw new Error("voice_audio_invalid_sample");
    energy += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  const rms = Math.sqrt(energy / Math.max(1, samples.length));
  if (rms < 0.0001 || peak === 0) return samples;
  const gain = Math.min(8, 0.9 / peak, Math.max(1, 0.035 / rms));
  if (gain === 1) return samples;
  return Float32Array.from(samples, (sample) => sample * gain);
}
