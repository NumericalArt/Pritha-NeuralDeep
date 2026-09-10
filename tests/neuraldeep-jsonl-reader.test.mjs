import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { readJsonlLines } from '../scripts/neuraldeep/jsonl-reader.mjs';

test('JSONL consumes each line with backpressure, exact UTF-8 boundaries and original-before-parse persistence', async () => {
  const input = Buffer.from(`${JSON.stringify({ text: '🌍'.repeat(2700000) })}\ninvalid\n${JSON.stringify({ done: true })}`);
  let produced = 0, persisted = 0, lines = 0;
  const source = Readable.from((async function* () { for (let n = 0; n < input.length; n += 4001) { produced++; yield input.subarray(n, n+4001); } })(), { highWaterMark: 1 });
  const result = [];
  for await (const line of readJsonlLines(source, { onChunk: chunk => { persisted += chunk.length; } })) {
    lines++; assert.ok(persisted >= Buffer.byteLength(line)); result.push(line);
    if (lines === 1) { const at = produced; await new Promise(resolve => setTimeout(resolve, 20)); assert.ok(produced - at <= 1); }
  }
  assert.equal(lines, 3); assert.equal(Buffer.from(result.join('')).equals(input), true); assert.equal(persisted, input.length);
});

test('malformed UTF-8 and oversized JSONL fail explicitly while captured bytes remain available', async () => {
  let captured = 0;
  await assert.rejects(async () => { for await (const _ of readJsonlLines(Readable.from([Buffer.alloc(1001, 97)]), { maximumLineBytes: 1000, onChunk: chunk => { captured += chunk.length; } })) {} }, { code: 'cli_record_too_large' });
  assert.equal(captured, 1001);
  await assert.rejects(async () => { for await (const _ of readJsonlLines(Readable.from([Buffer.from([0xff,10])]))) {} }, /encoded data/);
});
