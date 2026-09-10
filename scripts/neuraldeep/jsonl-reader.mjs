// Await both persistence and each consumer; never enqueue an unbounded chain of events.
export async function* readJsonlLines(stream, { maximumLineBytes = 64 * 1024 * 1024, onChunk } = {}) {
  let parts = [], bytes = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for await (const raw of stream) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    await onChunk?.(chunk);
    let start = 0;
    while (start < chunk.length) {
      const newline = chunk.indexOf(10, start), end = newline < 0 ? chunk.length : newline + 1;
      const part = chunk.subarray(start, end); bytes += part.length;
      if (bytes > maximumLineBytes) throw Object.assign(new Error('CLI record exceeds the parser limit; original log is preserved.'), { code: 'cli_record_too_large' });
      parts.push(part); start = end;
      if (newline >= 0) { const line = decoder.decode(Buffer.concat(parts, bytes)); parts = []; bytes = 0; yield line; }
    }
  }
  if (bytes) yield decoder.decode(Buffer.concat(parts, bytes));
}
