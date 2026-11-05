import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  STORAGE_KEYS,
  addToHistory,
  loadComponents,
  loadHistory,
  loadProvider,
  saveComponents,
  saveHistory,
  saveProvider,
} from './storage';
import type { GeneratedComponent } from '../types';

beforeEach(() => {
  localStorage.clear();
});

describe('provider 저장', () => {
  it('저장된 값이 없으면 google을 기본값으로 반환한다', () => {
    expect(loadProvider()).toBe('google');
  });

  it('저장한 provider를 다시 불러온다', () => {
    saveProvider('anthropic');
    expect(loadProvider()).toBe('anthropic');
  });

  it('허용되지 않은 값이 저장돼 있으면 기본값을 반환한다', () => {
    localStorage.setItem(STORAGE_KEYS.provider, 'openai');
    expect(loadProvider()).toBe('google');
  });
});

describe('프롬프트 히스토리 저장', () => {
  it('저장된 값이 없으면 빈 배열을 반환한다', () => {
    expect(loadHistory()).toEqual([]);
  });

  it('저장한 히스토리를 다시 불러온다', () => {
    saveHistory(['b', 'a']);
    expect(loadHistory()).toEqual(['b', 'a']);
  });

  it('JSON이 깨져 있으면 빈 배열을 반환한다', () => {
    localStorage.setItem(STORAGE_KEYS.history, '{not json');
    expect(loadHistory()).toEqual([]);
  });

  it('문자열이 아닌 항목은 걸러낸다', () => {
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(['a', 1, null, 'b']));
    expect(loadHistory()).toEqual(['a', 'b']);
  });
});

describe('addToHistory', () => {
  it('새 프롬프트를 맨 앞에 추가한다', () => {
    expect(addToHistory(['a'], 'b')).toEqual(['b', 'a']);
  });

  it('중복 프롬프트는 맨 앞으로 옮기고 중복을 만들지 않는다', () => {
    expect(addToHistory(['b', 'a'], 'a')).toEqual(['a', 'b']);
  });

  it('최대 개수를 넘으면 오래된 항목을 버린다', () => {
    expect(addToHistory(['c', 'b', 'a'], 'd', 3)).toEqual(['d', 'c', 'b']);
  });

  it('원본 배열을 변경하지 않는다', () => {
    const original = ['a'];
    addToHistory(original, 'b');
    expect(original).toEqual(['a']);
  });
});

describe('생성된 컴포넌트 목록 저장', () => {
  const sample: GeneratedComponent = {
    id: '1',
    prompt: '카드',
    code: 'render(<div />)',
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
  };

  it('저장된 값이 없으면 빈 배열을 반환한다', () => {
    expect(loadComponents()).toEqual([]);
  });

  it('저장한 컴포넌트를 불러오고 createdAt을 Date로 복원한다', () => {
    saveComponents([sample]);
    const [loaded] = loadComponents();
    expect(loaded.createdAt).toBeInstanceOf(Date);
    expect(loaded).toEqual(sample);
  });

  it('JSON이 깨져 있으면 빈 배열을 반환한다', () => {
    localStorage.setItem(STORAGE_KEYS.components, '{not json');
    expect(loadComponents()).toEqual([]);
  });

  it('필수 필드가 없는 항목은 걸러낸다', () => {
    localStorage.setItem(
      STORAGE_KEYS.components,
      JSON.stringify([{ id: 'x' }, { ...sample, createdAt: sample.createdAt.toISOString() }]),
    );
    expect(loadComponents()).toHaveLength(1);
  });
});

describe('저장 실패 처리', () => {
  it('저장소 쓰기가 예외를 던져도 save 함수는 던지지 않는다', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(() => saveProvider('anthropic')).not.toThrow();
    expect(() => saveHistory(['a'])).not.toThrow();
    expect(() => saveComponents([])).not.toThrow();
    spy.mockRestore();
  });
});

describe('API 키 비저장 (AGENTS.md Golden Rule)', () => {
  it('어떤 저장 함수도 apiKey 관련 키를 localStorage에 쓰지 않는다', () => {
    saveProvider('anthropic');
    saveHistory(['a']);
    saveComponents([]);
    const keys = Object.keys(localStorage);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.some((k) => /key/i.test(k))).toBe(false);
  });
});
