import type { GeneratedComponent, Provider } from '../types';

// 주의: API 키는 저장하지 않는다 (AGENTS.md Golden Rules). 키 관련 항목을 여기에 추가하지 말 것.
export const STORAGE_KEYS = {
  provider: 'rcg:provider',
  history: 'rcg:history',
  components: 'rcg:components',
} as const;

export const HISTORY_MAX = 20;
export const COMPONENTS_MAX = 50;

const DEFAULT_PROVIDER: Provider = 'google';
const PROVIDERS: readonly Provider[] = ['anthropic', 'google'];

function readJSON(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

// 용량 초과·사생활 보호 모드 등으로 쓰기가 실패해도 앱 동작은 유지한다.
function writeJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadProvider(): Provider {
  const value = readJSON(STORAGE_KEYS.provider);
  return PROVIDERS.find((p) => p === value) ?? DEFAULT_PROVIDER;
}

export function saveProvider(provider: Provider): void {
  writeJSON(STORAGE_KEYS.provider, provider);
}

export function loadHistory(): string[] {
  const value = readJSON(STORAGE_KEYS.history);
  if (!Array.isArray(value)) return [];
  const strings = value.filter((v): v is string => typeof v === 'string');
  return [...new Set(strings)].slice(0, HISTORY_MAX);
}

export function saveHistory(history: string[]): void {
  writeJSON(STORAGE_KEYS.history, history);
}

// 프롬프트창에 붙여넣은 API 키가 히스토리로 영속되지 않도록 키 형태를 걸러낸다.
const SECRET_PATTERNS = [/sk-[A-Za-z0-9_-]{20,}/, /AIza[A-Za-z0-9_-]{30,}/];

function looksLikeSecret(text: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

/** 새 프롬프트를 맨 앞에 두고 중복은 제거하며 최대 개수를 넘으면 오래된 항목을 버린다. 키로 보이는 프롬프트는 추가하지 않는다. */
export function addToHistory(history: string[], prompt: string, max = HISTORY_MAX): string[] {
  if (looksLikeSecret(prompt)) return history;
  return [prompt, ...history.filter((h) => h !== prompt)].slice(0, max);
}

function reviveComponent(value: unknown): GeneratedComponent | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, prompt, code, createdAt } = value as Record<string, unknown>;
  if (typeof id !== 'string' || typeof prompt !== 'string' || typeof code !== 'string') return null;
  if (typeof createdAt !== 'string') return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return { id, prompt, code, createdAt: date };
}

export function loadComponents(): GeneratedComponent[] {
  const value = readJSON(STORAGE_KEYS.components);
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map(reviveComponent)
    .filter((c): c is GeneratedComponent => c !== null)
    .filter((c) => !seen.has(c.id) && seen.add(c.id));
}

/** 최신 COMPONENTS_MAX개만 저장한다. 쓰기에 실패하면 false를 반환한다. */
export function saveComponents(components: GeneratedComponent[]): boolean {
  return writeJSON(STORAGE_KEYS.components, components.slice(0, COMPONENTS_MAX));
}
