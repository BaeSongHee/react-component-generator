#!/usr/bin/env bash
# PreToolUse(Write|Edit) 훅: 프로덕션 코드를 쓰기 전에 TDD 규칙을 상기시킨다.
# 차단하지 않고(exit 0) additionalContext로 리마인드만 주입한다.

input=$(cat)

# tool_input.file_path 추출
file=$(printf '%s' "$input" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed -e 's/^"file_path"[[:space:]]*:[[:space:]]*"//' -e 's/"$//')
file=${file//\\//}

# 테스트 파일, src/·server/ 밖의 파일(설정·문서 등)은 대상이 아니다
case "$file" in
  *.test.ts|*.test.tsx) exit 0 ;;
  */src/*|*/server/*|src/*|server/*) ;;
  *) exit 0 ;;
esac

# 타입 전용/순수 마크업 가능성이 있는 파일도 TDD 불필요 판단은 모델에게 맡긴다
msg='[TDD 리마인드] .claude/rules/tdd.md는 Rigid 규칙이다. 이 파일을 쓰기 전에 확인하라: (1) 비즈니스 로직/API/유틸/버그 수정이면 실패하는 테스트를 먼저 작성하고 `bun run test`로 실패(이유: 기능 미구현)를 눈으로 확인했는가? (2) 테스트보다 프로덕션 코드를 먼저 썼다면 그 코드를 삭제하고 RED부터 다시 시작한다. (3) GREEN은 테스트를 통과시키는 최소 코드만, YAGNI. (4) 타입 정의·설정·순수 UI·SQL만 TDD 불필요이며, 애매하면 TDD를 적용한다. (5) server/index.ts는 테스트 불가이므로 새 로직은 부수효과 없는 별도 모듈로 분리하고 *.test.ts를 함께 추가한다.'

printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"%s"}}\n' "$msg"
exit 0
