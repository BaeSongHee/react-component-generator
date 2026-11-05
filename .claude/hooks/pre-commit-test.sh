#!/usr/bin/env bash
# PreToolUse(Bash) 훅: git commit 직전에 전체 테스트를 실행한다.
# 테스트가 하나라도 실패하면 exit 2로 도구 호출을 차단한다.

input=$(cat)

# git commit 명령이 아니면 통과 (git commit-tree 등은 제외)
if ! printf '%s' "$input" | grep -Eq 'git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*commit([[:space:]]|\\|"|$)'; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

output=$(bun run test 2>&1)
status=$?

if [ $status -ne 0 ]; then
  {
    echo "테스트가 실패하여 커밋을 차단했습니다. 테스트를 수정해 모두 통과시킨 뒤 다시 커밋하세요."
    echo "----- bun run test 출력 (마지막 60줄) -----"
    printf '%s\n' "$output" | tail -n 60
  } >&2
  exit 2
fi

exit 0
