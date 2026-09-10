export function readJsonlLines(stream: AsyncIterable<Uint8Array | string>, options?: {
  maximumLineBytes?: number;
  onChunk?: (chunk: Uint8Array) => void | Promise<void>;
}): AsyncGenerator<string>;
