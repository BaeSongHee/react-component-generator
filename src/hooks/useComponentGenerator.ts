import { useState, useCallback, useEffect, useRef } from 'react';
import type { GeneratedComponent, Provider } from '../types';
import { COMPONENTS_MAX, loadComponents, saveComponents } from '../utils/storage';

interface UseComponentGeneratorReturn {
  components: GeneratedComponent[];
  isLoading: boolean;
  error: string | null;
  storageWarning: string | null;
  generate: (prompt: string, apiKey: string | undefined, provider: Provider) => Promise<boolean>;
  removeComponent: (id: string) => void;
  clearAll: () => void;
}

export function useComponentGenerator(): UseComponentGeneratorReturn {
  const [components, setComponents] = useState<GeneratedComponent[]>(loadComponents);
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

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...(apiKey && { apiKey }), provider }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate component');
      }

      const newComponent: GeneratedComponent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        prompt,
        code: data.code,
        createdAt: new Date(),
      };

      setComponents((prev) => [newComponent, ...prev]);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removeComponent = useCallback((id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setComponents([]);
  }, []);

  return { components, isLoading, error, storageWarning, generate, removeComponent, clearAll };
}
