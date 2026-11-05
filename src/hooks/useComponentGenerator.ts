import { useState, useCallback, useEffect, useRef } from 'react';
import type { GeneratedComponent, Provider } from '../types';
import { COMPONENTS_MAX, loadComponents, saveComponents } from '../utils/storage';
import { readNdjson } from '../utils/ndjson';

type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; code: string }
  | { type: 'error'; error: string };

interface UseComponentGeneratorReturn {
  components: GeneratedComponent[];
  /** 생성 중인 컴포넌트. 저장소에는 반영되지 않고, 완료되면 null이 된다. */
  streamingComponent: GeneratedComponent | null;
  isLoading: boolean;
  error: string | null;
  storageWarning: string | null;
  generate: (prompt: string, apiKey: string | undefined, provider: Provider) => Promise<boolean>;
  removeComponent: (id: string) => void;
  clearAll: () => void;
}

export function useComponentGenerator(): UseComponentGeneratorReturn {
  const [components, setComponents] = useState<GeneratedComponent[]>(loadComponents);
  const [streamingComponent, setStreamingComponent] = useState<GeneratedComponent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  // 마운트 시에는 저장하지 않는다. 로드에서 걸러진 항목을 저장소에서 지워 버리지 않기 위해서다.
  const initialComponents = useRef(components);

  useEffect(() => {
    if (components === initialComponents.current) return;
    setQuotaExceeded(!saveComponents(components));
  }, [components]);

  let storageWarning: string | null = null;
  if (quotaExceeded) {
    storageWarning =
      '브라우저 저장 공간이 부족해 컴포넌트를 저장하지 못했습니다. 새로고침하면 목록이 사라질 수 있습니다.';
  } else if (components.length > COMPONENTS_MAX) {
    storageWarning = `최근 ${COMPONENTS_MAX}개만 저장됩니다. 새로고침하면 오래된 컴포넌트는 사라집니다.`;
  }

  const generate = useCallback(async (prompt: string, apiKey: string | undefined, provider: Provider): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    // 스트리밍 카드와 완료 후 카드가 같은 key를 유지하도록 id를 미리 정한다.
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const createdAt = new Date();

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...(apiKey && { apiKey }), provider }),
      });

      // 연결 단계의 실패는 스트림이 아니라 JSON 에러로 온다.
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate component');
      }

      setStreamingComponent({ id, prompt, code: '', createdAt });

      let finalCode: string | null = null;
      for await (const event of readNdjson<StreamEvent>(res.body)) {
        if (event.type === 'delta') {
          setStreamingComponent((prev) => (prev ? { ...prev, code: prev.code + event.text } : prev));
        } else if (event.type === 'error') {
          throw new Error(event.error);
        } else if (event.type === 'done') {
          finalCode = event.code;
        }
      }

      if (finalCode === null) {
        throw new Error('응답이 중간에 끊겼습니다. 다시 시도해주세요.');
      }

      setComponents((prev) => [{ id, prompt, code: finalCode, createdAt }, ...prev]);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return false;
    } finally {
      setStreamingComponent(null);
      setIsLoading(false);
    }
  }, []);

  const removeComponent = useCallback((id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setComponents([]);
  }, []);

  return { components, streamingComponent, isLoading, error, storageWarning, generate, removeComponent, clearAll };
}
