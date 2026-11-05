import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useComponentGenerator } from './useComponentGenerator';
import { STORAGE_KEYS, loadComponents, saveComponents } from '../utils/storage';
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
