import { describe, it, expect } from 'vitest';
import { readNdjson } from './ndjson';

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

describe('readNdjson', () => {
  it('줄 단위 JSON을 순서대로 파싱한다', async () => {
    const body = streamOf('{"a":1}\n{"a":2}\n');
    expect(await collect(readNdjson(body))).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('청크 경계에서 잘린 줄을 이어 붙인다', async () => {
    const body = streamOf('{"a"', ':1}\n{"a":2}', '\n');
    expect(await collect(readNdjson(body))).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('빈 줄은 건너뛴다', async () => {
    const body = streamOf('{"a":1}\n\n{"a":2}\n');
    expect(await collect(readNdjson(body))).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('멀티바이트 문자가 청크 경계에서 잘려도 깨지지 않는다', async () => {
    const bytes = new TextEncoder().encode('{"t":"한"}\n');
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, 7));
        c.enqueue(bytes.slice(7));
        c.close();
      },
    });
    expect(await collect(readNdjson(body))).toEqual([{ t: '한' }]);
  });
});
