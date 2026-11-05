// 줄 단위 JSON(NDJSON) 스트림을 파싱하는 순수 함수.

export async function* readNdjson<T = unknown>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) yield JSON.parse(line) as T;
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) yield JSON.parse(buffer.trim()) as T;
  } finally {
    // 소비가 중단돼도(에러 이벤트 등) 연결을 해제한다.
    reader.cancel().catch(() => {});
  }
}
