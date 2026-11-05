import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { STORAGE_KEYS, saveHistory } from './utils/storage';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ envKeys: { anthropic: false, google: false } }),
    })),
  );
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

  it('API 키를 입력해도 저장소에 저장되지 않는다', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('API Key'), 'sk-secret-123');

    const dump = JSON.stringify({ ...localStorage });
    expect(dump).not.toContain('sk-secret-123');
  });
});
