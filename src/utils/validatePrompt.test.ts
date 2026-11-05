import { describe, it, expect } from 'vitest';
import { PROMPT_MAX_LENGTH, validatePromptLength } from './validatePrompt';

describe('validatePromptLength', () => {
  it('최대 길이는 500자다', () => {
    expect(PROMPT_MAX_LENGTH).toBe(500);
  });

  it('500자 이하면 유효하다', () => {
    expect(validatePromptLength('a'.repeat(500))).toEqual({ valid: true, length: 500 });
  });

  it('501자부터는 유효하지 않고 에러 메시지를 반환한다', () => {
    const result = validatePromptLength('a'.repeat(501));
    expect(result.valid).toBe(false);
    expect(result.length).toBe(501);
    expect(result.error).toContain('500');
  });

  it('앞뒤 공백은 길이에 포함하지 않는다', () => {
    expect(validatePromptLength(`  ${'a'.repeat(500)}  `).valid).toBe(true);
  });

  it('이모지 같은 서로게이트 쌍은 한 글자로 센다', () => {
    expect(validatePromptLength('😀'.repeat(500))).toEqual({ valid: true, length: 500 });
  });
});
