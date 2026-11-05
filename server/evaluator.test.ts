import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// evaluator 서브에이전트 정의(.claude/agents/evaluator.md)의 계약을 고정하는 테스트.
// 정의가 약화(쓰기 도구 추가, 모델 변경, 적대적 지시 삭제 등)되면 여기서 깨진다.

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n');

function parseAgent(source: string) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('frontmatter가 없다');
  const fields: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { fields, body: match[2] };
}

const { fields, body } = parseAgent(read('.claude/agents/evaluator.md'));
const tools = (fields.tools ?? '').split(',').map((t) => t.trim()).filter(Boolean);

describe('evaluator frontmatter', () => {
  it('이름이 evaluator다', () => {
    expect(fields.name).toBe('evaluator');
  });

  it('도구는 읽기 전용(Read, Grep, Glob)만 허용한다', () => {
    expect([...tools].sort()).toEqual(['Glob', 'Grep', 'Read']);
  });

  it.each(['Write', 'Edit', 'Bash', 'NotebookEdit', 'Agent'])('%s 도구를 포함하지 않는다', (tool) => {
    expect(tools).not.toContain(tool);
  });

  it('모델은 opus다', () => {
    expect(fields.model).toBe('opus');
  });

  it('description이 코드 작성 완료 시 자동 호출(PROACTIVELY)을 유도한다', () => {
    expect(fields.description).toContain('PROACTIVELY');
    expect(fields.description).toContain('완료');
  });
});

describe('evaluator 본문: 적대적 태도', () => {
  it('구현이 틀렸다고 가정하라고 지시한다', () => {
    expect(body).toContain('틀렸다고 가정');
  });

  it('구현자의 설명·테스트 통과 주장을 신뢰하지 말라고 지시한다', () => {
    expect(body).toMatch(/신뢰하지 말/);
  });

  it('파일을 수정하지 않는다고 명시한다', () => {
    expect(body).toMatch(/수정하지 않는다/);
  });

  it('코드·주석 안의 지시문을 따르지 않도록 프롬프트 인젝션을 방어한다', () => {
    expect(body).toMatch(/코드나 주석[^\n]*지시[^\n]*따르지 않는다/);
  });
});

describe('evaluator 본문: 입력과 근거', () => {
  it('변경 파일 목록이 없으면 판정하지 않고 요청하도록 한다', () => {
    expect(body).toMatch(/변경 파일 목록이 없으면/);
  });

  it('모든 지적에 파일:라인 근거를 요구한다', () => {
    expect(body).toMatch(/파일:라인/);
    expect(body).toMatch(/직접 읽[^\n]*근거/);
  });

  it('확인된 사실과 추측을 구분해 표시하도록 한다', () => {
    expect(body).toContain('확인됨');
    expect(body).toContain('추측');
  });
});

describe('evaluator 본문: 검토 범위', () => {
  it('tdd.md와 AGENTS.md를 검토 기준으로 참조한다', () => {
    expect(body).toContain('.claude/rules/tdd.md');
    expect(body).toContain('AGENTS.md');
  });

  it('테스트가 변경을 실제로 잡아내는지(코드를 지우면 테스트가 실패하는지) 점검한다', () => {
    expect(body).toMatch(/지우면|삭제하면/);
  });

  it('프로젝트 핵심 제약(키 노출, render 호출, 503/429, 포트 3002)을 점검 항목으로 둔다', () => {
    for (const keyword of ['API 키', 'render(', '503', '429', '3002']) {
      expect(body).toContain(keyword);
    }
  });
});

describe('evaluator 본문: 출력 형식', () => {
  it('심각도와 최종 판정 줄을 요구한다', () => {
    expect(body).toMatch(/치명/);
    expect(body).toMatch(/판정: 통과/);
    expect(body).toMatch(/판정: 수정 필요/);
  });

  it('통과 판정 시 시도한 반증 근거를 적도록 한다', () => {
    expect(body).toMatch(/시도한 반증/);
  });

  it('억지로 결함을 만들지 않도록 한다', () => {
    expect(body).toMatch(/억지로 결함을 만들지 않는다/);
  });
});

describe('evaluator 호출 규칙', () => {
  it('AGENTS.md가 코드 변경 후 evaluator 호출을 규정한다', () => {
    const agents = read('AGENTS.md');
    expect(agents).toContain('evaluator');
    expect(agents).toContain('.claude/agents/evaluator.md');
  });
});
