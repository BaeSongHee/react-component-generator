import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PromptInput } from './PromptInput';

describe('PromptInput', () => {
  it('프롬프트가 비어 있으면 생성 버튼이 비활성이다', () => {
    render(<PromptInput onGenerate={vi.fn()} isLoading={false} />);
    expect(screen.getByRole('button', { name: '컴포넌트 생성' })).toBeDisabled();
  });

  it('입력하면 버튼이 활성화되고 클릭 시 입력값으로 onGenerate가 호출된다', async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();
    render(<PromptInput onGenerate={onGenerate} isLoading={false} />);

    await user.type(screen.getByRole('textbox'), '프로필 카드');
    const submit = screen.getByRole('button', { name: '컴포넌트 생성' });
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(onGenerate).toHaveBeenCalledWith('프로필 카드');
  });

  it('로딩 중에는 생성 버튼이 비활성이고 "생성 중..." 을 보여준다', () => {
    render(<PromptInput onGenerate={vi.fn()} isLoading={true} />);
    expect(screen.getByRole('button', { name: '생성 중...' })).toBeDisabled();
  });

  it('500자 이하이면 글자 수 카운터를 보여준다', async () => {
    const user = userEvent.setup();
    render(<PromptInput onGenerate={vi.fn()} isLoading={false} />);

    await user.type(screen.getByRole('textbox'), '카드');
    expect(screen.getByText('2 / 500')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('500자를 넘으면 에러를 보여주고 생성 버튼이 비활성이다', async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();
    render(<PromptInput onGenerate={onGenerate} isLoading={false} />);

    await user.click(screen.getByRole('textbox'));
    await user.paste('a'.repeat(501));

    expect(screen.getByRole('alert')).toHaveTextContent('500자 이하');
    expect(screen.getByRole('button', { name: '컴포넌트 생성' })).toBeDisabled();
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('히스토리 항목을 보여주고 클릭하면 입력창에 채운다', async () => {
    const user = userEvent.setup();
    render(
      <PromptInput onGenerate={vi.fn()} isLoading={false} history={['프로필 카드', '검색 바']} />,
    );

    expect(screen.getByText('최근 프롬프트')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '검색 바' }));
    expect(screen.getByRole('textbox')).toHaveValue('검색 바');
  });

  it('히스토리가 비어 있으면 최근 프롬프트 영역을 보여주지 않는다', () => {
    render(<PromptInput onGenerate={vi.fn()} isLoading={false} history={[]} />);
    expect(screen.queryByText('최근 프롬프트')).not.toBeInTheDocument();
  });

  it('500자를 넘은 상태에서 Ctrl+Enter로도 제출되지 않는다', async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();
    render(<PromptInput onGenerate={onGenerate} isLoading={false} />);

    await user.click(screen.getByRole('textbox'));
    await user.paste('a'.repeat(501));
    await user.keyboard('{Control>}{Enter}{/Control}');

    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('히스토리가 있으면 기록 지우기 버튼이 onClearHistory를 호출한다', async () => {
    const onClearHistory = vi.fn();
    const user = userEvent.setup();
    render(
      <PromptInput onGenerate={vi.fn()} isLoading={false} history={['카드']} onClearHistory={onClearHistory} />,
    );

    await user.click(screen.getByRole('button', { name: '기록 지우기' }));

    expect(onClearHistory).toHaveBeenCalledTimes(1);
  });

  it('히스토리가 없으면 기록 지우기 버튼을 보여주지 않는다', () => {
    render(<PromptInput onGenerate={vi.fn()} isLoading={false} onClearHistory={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '기록 지우기' })).not.toBeInTheDocument();
  });
});
