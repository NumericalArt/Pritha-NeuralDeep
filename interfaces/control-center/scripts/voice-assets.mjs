import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'public', 'voice-vad');
await mkdir(target, { recursive: true });
const assets = [
  ['@ricky0123/vad-web', 'dist/silero_vad_v5.onnx'],
  ['@ricky0123/vad-web', 'dist/vad.worklet.bundle.min.js'],
  ['onnxruntime-web', 'dist/ort-wasm-simd-threaded.mjs'],
  ['onnxruntime-web', 'dist/ort-wasm-simd-threaded.wasm'],
];
const manifest = [];
for (const [pkg, file] of assets) {
  const source = path.join(root, 'node_modules', pkg, file),
    name = path.basename(file),
    bytes = await readFile(source);
  await copyFile(source, path.join(target, name));
  manifest.push({
    name,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
await writeFile(
  path.join(target, 'manifest.json'),
  JSON.stringify({ vad: '0.0.30', onnx: '1.29.0', assets: manifest }, null, 2) +
    '\n',
);
console.log('Voice VAD assets prepared from locked local dependencies.');
