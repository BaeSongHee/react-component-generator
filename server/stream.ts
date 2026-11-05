// 프로바이더 스트리밍 응답(SSE)을 파싱하고 NDJSON 응답 스트림으로 변환하는 모듈.
// 부수효과(Bun.serve, fetch)가 없어 단위 테스트가 가능하다.
import { stripCodeFences, ensureRenderCall } from './generator';

const TRUNCATED_MESSAGE = '생성된 코드가 너무 길어 잘렸습니다. 더 간단한 컴포넌트를 요청해주세요.';
const BLOCKED_MESSAGE = '요청이 안전 정책에 의해 차단되었습니다. 다른 설명으로 다시 시도해주세요.';
const INTERRUPTED_MESSAGE = '응답이 중간에 끊겼습니다. 다시 시도해주세요.';
const EMPTY_MESSAGE = '생성된 코드가 비어 있습니다. 다시 시도해주세요.';

/** SSE 본문에서 `data:` 페이로드를 줄 단위로 내보낸다. `[DONE]` 표식은 건너뛴다. */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const parseLine = (rawLine: string): string | null => {
    const line = rawLine.replace(/\r$/, '');
    if (!line.startsWith('data:')) return null;
    const payload = line.slice(5).trim();
    return payload && payload !== '[DONE]' ? payload : null;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const payload = parseLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        if (payload) yield payload;
      }
    }

    buffer += decoder.decode();
    const last = parseLine(buffer);
    if (last) yield last;
  } finally {
    // 소비가 중단돼도 업스트림 본문을 해제한다.
    reader.cancel().catch(() => {});
  }
}

/**
 * SSE 페이로드를 텍스트 조각으로 변환한다.
 * 프로바이더의 정상 종료 신호 없이 연결이 끝나면 부분 코드를 성공으로 취급하지 않도록 예외를 던진다.
 */
export async function* sseText(
  body: ReadableStream<Uint8Array>,
  toDelta: (data: string) => string,
  isDone: (data: string) => boolean,
): AsyncGenerator<string> {
  let completed = false;
  for await (const data of sseData(body)) {
    const text = toDelta(data);
    if (text) yield text;
    if (isDone(data)) completed = true;
  }
  if (!completed) throw new Error(INTERRUPTED_MESSAGE);
}

/** Anthropic 스트림 이벤트 하나에서 텍스트 조각을 꺼낸다. 에러·잘림은 예외로 던진다. */
export function anthropicDelta(data: string): string {
  const event = JSON.parse(data) as {
    type?: string;
    delta?: { type?: string; text?: string; stop_reason?: string };
    error?: { type?: string };
  };

  if (event.type === 'error') {
    // 에러 상태 매핑이 메시지의 상태 코드 문자열에 의존한다 (mapError).
    const status =
      event.error?.type === 'overloaded_error' ? 503 : event.error?.type === 'rate_limit_error' ? 429 : 500;
    throw new Error(`Claude API error: ${status}`);
  }

  if (event.type === 'message_delta' && event.delta?.stop_reason === 'max_tokens') {
    throw new Error(TRUNCATED_MESSAGE);
  }

  if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
    return event.delta.text ?? '';
  }
  return '';
}

export function anthropicDone(data: string): boolean {
  return (JSON.parse(data) as { type?: string }).type === 'message_stop';
}

type GoogleChunk = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
};

/** Google 스트림 청크 하나에서 텍스트 조각을 꺼낸다. 잘림·차단은 예외로 던진다. */
export function googleDelta(data: string): string {
  const chunk = JSON.parse(data) as GoogleChunk;

  if (chunk.promptFeedback?.blockReason) {
    throw new Error(BLOCKED_MESSAGE);
  }

  const candidate = chunk.candidates?.[0];
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new Error(TRUNCATED_MESSAGE);
  }
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
    throw new Error(BLOCKED_MESSAGE);
  }
  return candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
}

export function googleDone(data: string): boolean {
  return (JSON.parse(data) as GoogleChunk).candidates?.[0]?.finishReason === 'STOP';
}

/** 에러 메시지의 상태 코드 문자열로 HTTP 상태와 사용자 메시지를 결정한다. */
export function mapError(err: unknown): { status: number; error: string } {
  const message = err instanceof Error ? err.message : 'Unknown error';

  if (message.includes('503')) {
    return { status: 503, error: 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.' };
  }
  if (message.includes('429')) {
    return { status: 429, error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' };
  }
  return { status: 500, error: message };
}

/**
 * 텍스트 조각 스트림을 NDJSON 이벤트 스트림으로 바꾼다.
 * 델타는 그대로 내보내고, 끝나면 코드펜스 제거·render 호출 보정을 거친 최종 코드를 done으로 보낸다.
 * 클라이언트가 연결을 끊으면 onCancel로 업스트림 요청 중단을 알린다.
 */
export function streamToNdjson(source: AsyncGenerator<string>, onCancel?: () => void): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let text = '';

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const { value, done } = await source.next();
        if (!done) {
          text += value;
          send({ type: 'delta', text: value });
          return;
        }

        const code = ensureRenderCall(stripCodeFences(text));
        send(code ? { type: 'done', code } : { type: 'error', error: EMPTY_MESSAGE });
      } catch (err) {
        send({ type: 'error', error: mapError(err).error });
      }
      controller.close();
    },
    cancel() {
      onCancel?.();
      source.return(undefined).catch(() => {});
    },
  });
}
