import { useState } from 'react';
import type { GeneratedComponent } from '../types';
import { LivePreview } from './LivePreview';
import { CodeView } from './CodeView';

interface ComponentCardProps {
  component: GeneratedComponent;
  onRemove: (id: string) => void;
  onRegenerate: (prompt: string) => void;
  isLoading: boolean;
  /** 코드를 스트리밍 중인 카드. 코드 탭을 고정하고, 끝나면 미리보기 탭으로 전환한다. */
  isStreaming?: boolean;
}

type Tab = 'preview' | 'code';

export function ComponentCard({
  component,
  onRemove,
  onRegenerate,
  isLoading,
  isStreaming = false,
}: ComponentCardProps) {
  const [activeTab, setActiveTab] = useState<Tab>(isStreaming ? 'code' : 'preview');
  const [prevStreaming, setPrevStreaming] = useState(isStreaming);
  // 스트리밍 상태가 바뀌는 렌더에서 탭을 맞춘다 (시작 → 코드, 완료 → 미리보기).
  if (isStreaming !== prevStreaming) {
    setPrevStreaming(isStreaming);
    setActiveTab(isStreaming ? 'code' : 'preview');
  }
  const [previewKey, setPreviewKey] = useState(0);
  const createdAt = component.createdAt.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <article className="win component-card">
      <div className="win-title">
        <span className="win-title-text">컴포넌트 {createdAt}</span>
        {!isStreaming && (
          <button
            className="win-close"
            onClick={() => onRemove(component.id)}
            title="삭제"
            aria-label="삭제"
          >
            ×
          </button>
        )}
      </div>
      <div className="card-header">
        <p className="card-prompt">{component.prompt}</p>
        <div className="card-actions">
          <button
            className="btn btn-refresh"
            onClick={() => setPreviewKey((k) => k + 1)}
            title="미리보기 새로고침"
            aria-label="미리보기 새로고침"
          >
            ↻
          </button>
          <button
            className="btn btn-regenerate"
            onClick={() => onRegenerate(component.prompt)}
            disabled={isLoading}
          >
            {isLoading ? '생성 중...' : '재생성'}
          </button>
        </div>
      </div>
      <div className="card-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'preview'}
          className={`tab ${activeTab === 'preview' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('preview')}
          disabled={isStreaming}
        >
          미리보기
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'code'}
          className={`tab ${activeTab === 'code' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('code')}
        >
          코드
        </button>
      </div>
      <div className="card-content">
        {activeTab === 'preview' ? (
          <LivePreview key={previewKey} code={component.code} />
        ) : (
          <CodeView code={component.code} isStreaming={isStreaming} />
        )}
      </div>
    </article>
  );
}
