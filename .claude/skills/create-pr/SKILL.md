---
name: create-pr
description: 현재 브랜치의 변경사항을 분석해 프로젝트 언어(한국어/영어)에 맞는 템플릿으로 GitHub Pull Request를 생성한다. 서브 에이전트(fork)에서 실행된다. "PR 만들어줘", "PR 생성", "풀리퀘스트 올려줘", "create pr", "open a pull request", "make a PR" 같은 요청에 활성화한다. 커밋 후 "이제 올려줘", "리뷰 요청할 수 있게 해줘"처럼 PR을 암시하는 경우에도 사용한다.
context: fork
allowed-tools: Bash, Read, Glob, Grep
---

# create-pr

현재 브랜치의 변경사항으로 GitHub PR을 만드는 스킬. `context: fork`로 서브 에이전트에서 실행되므로, 메인 대화에는 **최종 결과(PR URL, 사용한 템플릿 언어, 특이사항)만** 짧게 보고한다. 서브 에이전트는 사용자에게 되묻기 어려우니, 판단이 필요한 상황에서는 임의로 진행하지 말고 중단 사유를 보고하고 끝낸다.

## 절차

### 1. 사전 확인
- `git branch --show-current`로 현재 브랜치를 확인한다. 기본 브랜치(main/master)이면 PR을 만들지 않고 "기능 브랜치에서 다시 요청해 달라"고 보고한 뒤 종료한다. PR의 head가 base와 같을 수 없기 때문이다.
- `git status --short`에 커밋되지 않은 변경이 있으면 PR에 포함되지 않는다는 점을 최종 보고에 적는다. 커밋은 대신 하지 않는다(커밋은 `commit` 스킬의 몫).
- base 브랜치는 `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`로 얻는다. 사용자가 base를 지정했으면 그것을 따른다.
- `gh auth status`가 실패하면 로그인 필요 사실을 보고하고 종료한다.

### 2. 변경 내용 분석
- `git log <base>..HEAD --oneline`으로 PR에 포함될 커밋을, `git diff <base>...HEAD --stat`과 `git diff <base>...HEAD`로 실제 변경을 읽는다. 커밋 메시지만 보면 실제 변경과 어긋날 수 있어 diff를 직접 확인한다.
- 이미 같은 브랜치의 열린 PR이 있는지 `gh pr list --head <branch> --state open`으로 확인한다. 있으면 새로 만들지 않고 기존 URL을 보고한다.
- `.env`, 키, 토큰 등 비밀 정보가 diff에 보이면 push하지 말고 중단 사유를 보고한다.

### 3. 템플릿 언어 결정
PR 템플릿은 `references/` 아래 두 가지다.

- `references/pr-template-ko.md` — 한국어
- `references/pr-template-en.md` — 영어

독자가 읽을 수 있는 언어로 써야 하므로, 아래 순서로 **프로젝트의 주 사용 언어**를 판단한다. 앞 단계에서 결론이 나면 멈춘다.

1. **사용자 명시**: "영어로", "in English", "한국어로" 등 요청에 언어 지정이 있으면 그것을 따른다.
2. **프로젝트 규칙 문서**: `CLAUDE.md`/`AGENTS.md`/`CONTRIBUTING.md`에 언어 규칙이 있으면 따른다. (이 저장소는 커밋·주석·사용자 노출 메시지가 한국어라고 명시돼 있다.)
3. **저장소 신호**: `README.md` 본문 언어, 최근 커밋 메시지(`git log -10`), 기존 PR 제목(`gh pr list --state all --limit 10`)의 언어를 본다. 대부분이 한국어면 한국어, 영어면 영어.
4. **그래도 불분명하면** 한국어 템플릿을 기본값으로 쓰고, 최종 보고에 "언어를 추정했다"고 밝힌다.

해외 오픈소스(영문 README/이슈/PR, 외국 기여자 다수)는 영어, 국내 프로젝트(한국어 README·커밋·PR)는 한국어가 일반적인 결과다. 저장소에 `.github/pull_request_template.md`가 이미 있으면 그 파일이 프로젝트의 공식 양식이므로 `references/` 템플릿 대신 그 구조를 따른다.

### 4. PR 제목과 본문 작성
- 선택한 템플릿 파일을 읽고 섹션 구조를 그대로 유지해 채운다. 해당 없는 섹션은 지우지 말고 "해당 없음"/"N/A"로 둔다. 리뷰어가 항상 같은 위치에서 같은 정보를 찾을 수 있게 하기 위해서다.
- 제목은 70자 이내 한 줄이다. 한국어 프로젝트는 커밋 컨벤션과 맞춰 `타입: 요약`(feat/fix/refactor/chore, 마침표 없음)을 쓰고, 영어 프로젝트는 명령형 현재 시제 요약(`feat: add component export`처럼 접두어는 저장소 관례를 따름)을 쓴다.
- "왜"를 먼저 쓴다. 파일 나열이 아니라 변경 동기와 영향 범위를 적는다.
- 테스트 항목은 **실제로 실행한 것만** 체크한다. 이 저장소라면 `bun run test`, `bun run lint`, `bun run build`가 기준이다(AGENTS.md). 실행하지 않았거나 실패한 것은 체크하지 않고 그대로 적는다.
- 관련 이슈 번호를 브랜치명·커밋에서 찾을 수 있으면 `Closes #N`으로 연결한다. 추측으로 번호를 만들지 않는다.
- 시스템 지침에 PR attribution 줄이 지정돼 있으면 본문 끝에 추가한다.

### 5. push 및 PR 생성
- 원격에 브랜치가 없거나 뒤처져 있으면 `git push -u origin <branch>`로 올린다. force push는 하지 않는다.
- 본문은 HEREDOC으로 `--body-file -` 또는 임시 파일로 전달해 줄바꿈·인코딩 문제를 피한다.
  ```bash
  gh pr create --base <base> --title "<제목>" --body-file - <<'EOF'
  <본문>
  EOF
  ```
- 사용자가 "draft로"를 요청하면 `--draft`를 붙인다. 리뷰어·라벨은 요청이 있을 때만 지정한다.

### 6. 보고
메인 대화에 아래만 간결하게 전달한다.
- PR URL
- 사용한 템플릿 언어와 그 판단 근거 한 줄
- 커밋되지 않은 변경, 실행하지 못한 검증, 추정한 항목 등 사용자가 알아야 할 특이사항

## 주의
- 사용자가 요청하지 않는 한 `--force`, 기존 PR 덮어쓰기, PR 머지는 하지 않는다.
- API 키 등 비밀 값을 PR 본문·로그에 넣지 않는다(AGENTS.md Golden Rules).
- 변경사항이 base와 동일(커밋 없음)하면 PR을 만들지 않고 그렇게 보고한다.
