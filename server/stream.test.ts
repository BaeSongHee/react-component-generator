import { describe, it, expect, vi } from 'vitest';
import {
  sseData,
  sseText,
  anthropicDelta,
  anthropicDone,
  googleDelta,
  googleDone,
  mapError,
  streamToNdjson,
} from './stream';

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

describe('sseData', () => {
  it('data: 줄의 페이로드를 순서대로 내보낸다', async () => {
    const body = streamOf('data: {"a":1}\n\ndata: {"a":2}\n\n');
    expect(await collect(sseData(body))).toEqual(['{"a":1}', '{"a":2}']);
  });

  it('청크 경계에서 줄이 잘려도 이어 붙여 파싱한다', async () => {
    const body = streamOf('data: {"a"', ':1}\n\ndata: {"a":2}\n', '\n');
    expect(await collect(sseData(body))).toEqual(['{"a":1}', '{"a":2}']);
  });

  it('event: 줄과 [DONE] 표식은 무시한다', async () => {
    const body = streamOf('event: content_block_delta\ndata: {"a":1}\n\ndata: [DONE]\n\n');
    expect(await collect(sseData(body))).toEqual(['{"a":1}']);
  });

  it('CRLF 줄바꿈도 처리한다', async () => {
    const body = streamOf('data: {"a":1}\r\n\r\n');
    expect(await collect(sseData(body))).toEqual(['{"a":1}']);
  });

  it('마지막 줄에 개행이 없어도 내보낸다', async () => {
    const body = streamOf('data: {"a":1}');
    expect(await collect(sseData(body))).toEqual(['{"a":1}']);
  });
});

describe('anthropicDelta', () => {
  it('content_block_delta의 text를 반환한다', () => {
    const data = JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'const' } });
    expect(anthropicDelta(data)).toBe('const');
  });

  it('텍스트가 없는 이벤트는 빈 문자열을 반환한다', () => {
    expect(anthropicDelta(JSON.stringify({ type: 'message_start' }))).toBe('');
  });

  it.each([
    ['overloaded_error', '503'],
    ['rate_limit_error', '429'],
    ['api_error', '500'],
  ])('error 이벤트 %s는 메시지에 상태 코드 %s를 담아 던진다', (type, status) => {
    const data = JSON.stringify({ type: 'error', error: { type, message: 'x' } });
    expect(() => anthropicDelta(data)).toThrow(`Claude API error: ${status}`);
  });

  it('max_tokens로 끝나면 잘림 에러를 던진다', () => {
    const data = JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'max_tokens' } });
    expect(() => anthropicDelta(data)).toThrow('너무 길어');
  });
});

describe('googleDelta', () => {
  it('candidates의 parts 텍스트를 이어 붙여 반환한다', () => {
    const data = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] });
    expect(googleDelta(data)).toBe('ab');
  });

  it('candidates가 없으면 빈 문자열을 반환한다', () => {
    expect(googleDelta(JSON.stringify({}))).toBe('');
  });

  it('MAX_TOKENS로 끝나면 잘림 에러를 던진다', () => {
    const data = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'a' }] }, finishReason: 'MAX_TOKENS' }] });
    expect(() => googleDelta(data)).toThrow('너무 길어');
  });
});

describe('googleDelta 비정상 종료', () => {
  it('안전 차단(SAFETY)으로 끝나면 예외를 던진다', () => {
    const data = JSON.stringify({ candidates: [{ finishReason: 'SAFETY' }] });
    expect(() => googleDelta(data)).toThrow('차단');
  });

  it('프롬프트가 차단되면(blockReason) 예외를 던진다', () => {
    const data = JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } });
    expect(() => googleDelta(data)).toThrow('차단');
  });

  it('STOP으로 끝나는 청크는 정상이다', () => {
    const data = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'a' }] }, finishReason: 'STOP' }] });
    expect(googleDelta(data)).toBe('a');
  });
});

describe('종료 신호 판별', () => {
  it('anthropicDone은 message_stop에서만 true다', () => {
    expect(anthropicDone(JSON.stringify({ type: 'message_stop' }))).toBe(true);
    expect(anthropicDone(JSON.stringify({ type: 'message_start' }))).toBe(false);
  });

  it('googleDone은 finishReason이 STOP일 때만 true다', () => {
    expect(googleDone(JSON.stringify({ candidates: [{ finishReason: 'STOP' }] }))).toBe(true);
    expect(googleDone(JSON.stringify({ candidates: [{ content: { parts: [] } }] }))).toBe(false);
  });
});

describe('sseText', () => {
  const delta = (text: string) => `data: ${JSON.stringify({ t: text })}\n\n`;
  const toDelta = (d: string) => (JSON.parse(d) as { t?: string }).t ?? '';
  const isDone = (d: string) => (JSON.parse(d) as { stop?: boolean }).stop === true;

  it('종료 신호까지 텍스트 조각을 내보낸다', async () => {
    const body = streamOf(delta('a'), delta('b'), 'data: {"stop":true}\n\n');
    expect(await collect(sseText(body, toDelta, isDone))).toEqual(['a', 'b']);
  });

  it('종료 신호 없이 연결이 끝나면 끊김 에러를 던진다', async () => {
    const body = streamOf(delta('a'));
    await expect(collect(sseText(body, toDelta, isDone))).rejects.toThrow('끊겼');
  });
});

describe('mapError', () => {
  it('503이 포함되면 과부하 안내와 503을 반환한다', () => {
    expect(mapError(new Error('Gemini API error: 503'))).toMatchObject({ status: 503 });
  });

  it('429가 포함되면 요청 과다 안내와 429를 반환한다', () => {
    expect(mapError(new Error('Claude API error: 429'))).toMatchObject({ status: 429 });
  });

  it('그 외에는 원본 메시지와 500을 반환한다', () => {
    expect(mapError(new Error('boom'))).toEqual({ status: 500, error: 'boom' });
  });
});

async function* textOf(...parts: string[]): AsyncGenerator<string> {
  for (const p of parts) yield p;
}

async function readEvents(stream: ReadableStream<Uint8Array>): Promise<object[]> {
  const text = await new Response(stream).text();
  return text.trim().split('\n').map((line) => JSON.parse(line));
}

describe('streamToNdjson', () => {
  it('델타를 순서대로 내보내고 마지막에 done을 보낸다', async () => {
    const events = await readEvents(streamToNdjson(textOf('const A', ' = 1;')));
    expect(events).toEqual([
      { type: 'delta', text: 'const A' },
      { type: 'delta', text: ' = 1;' },
      { type: 'done', code: expect.any(String) },
    ]);
  });

  it('done 코드는 코드펜스를 제거하고 render 호출을 주입한다 (이중 방어)', async () => {
    const events = await readEvents(streamToNdjson(textOf('```jsx\nconst Card = () => null;\n', '```')));
    expect(events.at(-1)).toEqual({ type: 'done', code: 'const Card = () => null;\n\nrender(<Card />);' });
  });

  it('스트림 중간에 실패하면 error 이벤트를 보내고 done은 보내지 않는다', async () => {
    async function* failing(): AsyncGenerator<string> {
      yield 'const';
      throw new Error('Gemini API error: 503');
    }
    const events = await readEvents(streamToNdjson(failing()));
    expect(events.at(-1)).toMatchObject({ type: 'error', error: expect.stringContaining('과부하') });
    expect(events.some((e) => (e as { type: string }).type === 'done')).toBe(false);
  });

  it('생성된 텍스트가 비어 있으면 done 대신 error를 보낸다', async () => {
    const events = await readEvents(streamToNdjson(textOf()));
    expect(events).toEqual([{ type: 'error', error: expect.stringContaining('비어') }]);
  });

  it('클라이언트가 취소하면 onCancel로 업스트림 중단을 알린다', async () => {
    async function* source(): AsyncGenerator<string> {
      yield 'a';
      await new Promise(() => {}); // 업스트림 응답 대기
    }
    const onCancel = vi.fn();
    const reader = streamToNdjson(source(), onCancel).getReader();
    await reader.read();
    await reader.cancel();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
