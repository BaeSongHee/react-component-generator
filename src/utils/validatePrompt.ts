export const PROMPT_MAX_LENGTH = 500;

export interface PromptValidation {
  valid: boolean;
  length: number;
  error?: string;
}

/** 프롬프트 길이를 검증한다. 앞뒤 공백은 제외하고 코드 포인트 단위로 센다. */
export function validatePromptLength(prompt: string): PromptValidation {
  const length = Array.from(prompt.trim()).length;
  if (length > PROMPT_MAX_LENGTH) {
    return {
      valid: false,
      length,
      error: `프롬프트는 ${PROMPT_MAX_LENGTH}자 이하로 입력해주세요. (현재 ${length}자)`,
    };
  }
  return { valid: true, length };
}
