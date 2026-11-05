import { useEffect, useRef, useState } from 'react';

interface CodeViewProps {
  code: string;
  /** 스트리밍 중이면 새 코드가 도착할 때마다 맨 아래로 스크롤한다. */
  isStreaming?: boolean;
}

export function CodeView({ code, isStreaming = false }: CodeViewProps) {
  const [copied, setCopied] = useState(false);
  const blockRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = blockRef.current;
    if (isStreaming && el) el.scrollTop = el.scrollHeight;
  }, [code, isStreaming]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-panel">
      <div className="panel-header">
        <span>Component.jsx</span>
        <button className="btn btn-copy" onClick={handleCopy}>
          {copied ? '복사됨!' : '복사'}
        </button>
      </div>
      <pre className={`code-block ${isStreaming ? 'code-block--streaming' : ''}`} ref={blockRef}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
