import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComponentCard } from './ComponentCard';
import type { GeneratedComponent } from '../types';

vi.mock('./LivePreview', () => ({
  LivePreview: ({ code }: { code: string }) => <div data-testid="live-preview">{code}</div>,
}));

const base: GeneratedComponent = {
  id: 'a',
  prompt: '카드',
  code: 'const A = 1;',
  createdAt: new Date('2026-01-02T03:04:05.000Z'),
};

function renderCard(component: GeneratedComponent, isStreaming = false) {
  const props = { onRemove: vi.fn(), onRegenerate: vi.fn(), isLoading: isStreaming };
  const view = render(<ComponentCard component={component} isStreaming={isStreaming} {...props} />);
  const rerender = (next: GeneratedComponent, streaming: boolean) =>
    view.rerender(<ComponentCard component={next} isStreaming={streaming} {...props} isLoading={streaming} />);
  return { ...view, rerender };
}

describe('ComponentCard 스트리밍', () => {
  it('생성 중에는 코드 탭이 선택되고 누적된 코드를 보여준다', () => {
    renderCard({ ...base, code: 'const ' }, true);

    expect(screen.getByRole('tab', { name: '코드' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('const')).toBeInTheDocument();
    expect(screen.queryByTestId('live-preview')).not.toBeInTheDocument();
  });

  it('생성 중에는 미리보기 탭이 비활성이다', () => {
    renderCard(base, true);
    expect(screen.getByRole('tab', { name: '미리보기' })).toBeDisabled();
  });

  it('생성이 끝나면 미리보기 탭으로 자동 전환된다', () => {
    const { rerender } = renderCard({ ...base, code: 'const ' }, true);

    rerender({ ...base, code: 'const A = 1;\n\nrender(<A />);' }, false);

    expect(screen.getByRole('tab', { name: '미리보기' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('live-preview')).toBeInTheDocument();
  });

  it('생성 중에는 삭제 버튼을 숨기고, 끝나면 보여준다', () => {
    const { rerender } = renderCard(base, true);
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();

    rerender(base, false);
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
  });

  it('스트리밍이 아닌 카드는 미리보기 탭으로 시작한다', () => {
    renderCard(base, false);
    expect(screen.getByRole('tab', { name: '미리보기' })).toHaveAttribute('aria-selected', 'true');
  });

  it('완료 후에는 사용자가 코드 탭으로 다시 전환할 수 있다', async () => {
    const user = userEvent.setup();
    const { rerender } = renderCard(base, true);
    rerender(base, false);

    await user.click(screen.getByRole('tab', { name: '코드' }));

    expect(screen.getByRole('tab', { name: '코드' })).toHaveAttribute('aria-selected', 'true');
  });
});
