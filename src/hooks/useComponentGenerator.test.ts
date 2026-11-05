import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useComponentGenerator } from './useComponentGenerator';
import { COMPONENTS_MAX, STORAGE_KEYS, loadComponents, saveComponents } from '../utils/storage';
import type { GeneratedComponent } from '../types';

const sample: GeneratedComponent = {
  id: 'a',
  prompt: '카드',
  code: 'render(<div />)',
  createdAt: new Date('2026-01-02T03:04:05.000Z'),
};

beforeEach(() => {
  localStorage.clear();
});

describe('useComponentGenerator 영속성', () => {
  it('저장된 컴포넌트 목록으로 초기화된다', () => {
    saveComponents([sample]);
    const { result } = renderHook(() => useComponentGenerator());
    expect(result.current.components).toEqual([sample]);
  });

  it('컴포넌트를 삭제하면 저장소에도 반영된다', () => {
    saveComponents([sample, { ...sample, id: 'b' }]);
    const { result } = renderHook(() => useComponentGenerator());

    act(() => result.current.removeComponent('a'));

    expect(loadComponents().map((c) => c.id)).toEqual(['b']);
  });

  it('전체 삭제하면 저장소도 비워진다', () => {
    saveComponents([sample]);
    const { result } = renderHook(() => useComponentGenerator());

    act(() => result.current.clearAll());

    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.components) ?? 'null')).toEqual([]);
  });
});

const encoder = new TextEncoder();

function ndjsonResponse(events: object[]): Response {
  const body = events.map((e) => `${JSON.stringify(e)}\n`).join('');
  return new Response(body, { status: 200 });
}

describe('useComponentGenerator generate 결과', () => {
  it('생성에 성공하면 true를 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ndjsonResponse([{ type: 'done', code: 'render(<div />)' }])));
    const { result } = renderHook(() => useComponentGenerator());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.generate('카드', 'key', 'google');
    });

    expect(ok).toBe(true);
  });

  it('완료되면 최종 코드로 컴포넌트가 추가되고 스트리밍 상태는 비워진다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ndjsonResponse([
          { type: 'delta', text: 'const A' },
          { type: 'done', code: 'const A = 1;\n\nrender(<A />);' },
        ]),
      ),
    );
    const { result } = renderHook(() => useComponentGenerator());

    await act(async () => {
      await result.current.generate('카드', 'key', 'google');
    });

    expect(result.current.components[0].code).toBe('const A = 1;\n\nrender(<A />);');
    expect(result.current.streamingComponent).toBeNull();
  });

  it('델타가 도착하는 동안 streamingComponent.code가 누적된다', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })));
    const { result } = renderHook(() => useComponentGenerator());

    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.generate('카드', 'key', 'google');
    });

    await act(async () => {
      controller.enqueue(encoder.encode('{"type":"delta","text":"const "}\n'));
      controller.enqueue(encoder.encode('{"type":"delta","text":"A"}\n'));
    });
    await vi.waitFor(() => expect(result.current.streamingComponent?.code).toBe('const A'));
    expect(result.current.streamingComponent?.prompt).toBe('카드');

    await act(async () => {
      controller.enqueue(encoder.encode('{"type":"done","code":"const A;"}\n'));
      controller.close();
      await pending;
    });
    expect(result.current.streamingComponent).toBeNull();
  });

  it('스트림 중 error 이벤트가 오면 false를 반환하고 컴포넌트를 추가하지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ndjsonResponse([{ type: 'delta', text: 'const' }, { type: 'error', error: '잘렸습니다' }])),
    );
    const { result } = renderHook(() => useComponentGenerator());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.generate('카드', 'key', 'google');
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('잘렸습니다');
    expect(result.current.components).toEqual([]);
    expect(result.current.streamingComponent).toBeNull();
  });

  it('done 이벤트 없이 스트림이 끝나면 실패로 처리한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ndjsonResponse([{ type: 'delta', text: 'const' }])));
    const { result } = renderHook(() => useComponentGenerator());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.generate('카드', 'key', 'google');
    });

    expect(ok).toBe(false);
    expect(result.current.components).toEqual([]);
  });

  it('생성에 실패하면 false를 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: '503' }) })));
    const { result } = renderHook(() => useComponentGenerator());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.generate('카드', 'key', 'google');
    });

    expect(ok).toBe(false);
  });
});

describe('useComponentGenerator 저장 경고', () => {
  it('컴포넌트 저장에 실패하면 storageWarning을 노출한다', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    saveComponents([sample]);
    const { result } = renderHook(() => useComponentGenerator());

    act(() => result.current.removeComponent('a'));

    expect(result.current.storageWarning).toMatch(/저장/);
    spy.mockRestore();
  });

  it('저장에 성공하면 storageWarning이 null이다', () => {
    const { result } = renderHook(() => useComponentGenerator());
    expect(result.current.storageWarning).toBeNull();
  });
});

describe('useComponentGenerator 저장 보존', () => {
  it('마운트만으로는 저장소를 다시 쓰지 않아 검증에 실패한 항목도 보존된다', () => {
    const raw = JSON.stringify([sample, { id: 'broken' }]);
    localStorage.setItem(STORAGE_KEYS.components, raw);

    renderHook(() => useComponentGenerator());

    expect(localStorage.getItem(STORAGE_KEYS.components)).toBe(raw);
  });

  it('저장 가능 개수를 넘으면 일부만 저장된다는 storageWarning을 노출한다', () => {
    const many = Array.from({ length: COMPONENTS_MAX + 1 }, (_, i) => ({ ...sample, id: `id${i}` }));
    localStorage.setItem(STORAGE_KEYS.components, JSON.stringify(many));
    const { result } = renderHook(() => useComponentGenerator());

    expect(result.current.storageWarning).toMatch(new RegExp(String(COMPONENTS_MAX)));
  });
});
