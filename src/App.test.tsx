import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { STORAGE_KEYS, saveHistory } from './utils/storage';

function mockApi({ generateOk = true }: { generateOk?: boolean } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/generate') {
        return generateOk
          ? { ok: true, json: async () => ({ code: 'render(<div>ok</div>)' }) }
          : { ok: false, json: async () => ({ error: 'API error: 503' }) };
      }
      return { ok: true, json: async () => ({ envKeys: { anthropic: false, google: false } }) };
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mockApi();
});

describe('App 영속성', () => {
  it('저장된 provider로 시작한다', () => {
    localStorage.setItem(STORAGE_KEYS.provider, JSON.stringify('anthropic'));
    render(<App />);
    expect(screen.getByLabelText('Provider')).toHaveValue('anthropic');
  });

  it('provider를 바꾸면 저장소에 반영된다', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByLabelText('Provider'), 'anthropic');

    expect(localStorage.getItem(STORAGE_KEYS.provider)).toBe(JSON.stringify('anthropic'));
  });

  it('저장된 히스토리를 최근 프롬프트로 보여준다', () => {
    saveHistory(['프로필 카드']);
    render(<App />);
    expect(screen.getByRole('button', { name: '프로필 카드' })).toBeInTheDocument();
  });

  it('API 키로 생성해도 localStorage와 sessionStorage에 키가 저장되지 않는다', async () => {
    mockApi({ generateOk: true });
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('API Key'), 'sk-secret-123');
    await user.type(screen.getByPlaceholderText(/고객 목록/), '프로필 카드');
    await user.click(screen.getByRole('button', { name: '컴포넌트 생성' }));
    await screen.findAllByText('프로필 카드');
    await user.selectOptions(screen.getByLabelText('Provider'), 'anthropic');

    const dump = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(dump).not.toContain('sk-secret-123');
  });

  it('생성에 성공한 프롬프트만 히스토리에 저장한다', async () => {
    mockApi({ generateOk: true });
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('API Key'), 'k');
    await user.type(screen.getByPlaceholderText(/고객 목록/), '프로필 카드');
    await user.click(screen.getByRole('button', { name: '컴포넌트 생성' }));

    await screen.findByText('최근 프롬프트');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.history) ?? '[]')).toEqual(['프로필 카드']);
  });

  it('생성에 실패한 프롬프트는 히스토리에 저장하지 않는다', async () => {
    mockApi({ generateOk: false });
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('API Key'), 'k');
    await user.type(screen.getByPlaceholderText(/고객 목록/), '프로필 카드');
    await user.click(screen.getByRole('button', { name: '컴포넌트 생성' }));

    await screen.findByText(/503/);
    expect(localStorage.getItem(STORAGE_KEYS.history)).toBeNull();
  });

  it('컴포넌트 저장에 실패하면 경고 배너를 보여준다', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    render(<App />);
    expect(screen.getByText(/저장 공간이 부족/)).toBeInTheDocument();
    spy.mockRestore();
  });
});
