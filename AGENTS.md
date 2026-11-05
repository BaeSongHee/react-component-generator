`# AGENTS.md
`
`## Operational Commands
`
`- 패키지 매니저/런타임은 `bun` 고정. `npm`/`yarn`/`pnpm` 사용 금지 (`server`는 `Bun.serve` 사용, `package.json` scripts가 `bun` 전제).
`- `bun install` — 의존성 설치
`- `bun run dev` — API 서버(3002) + Vite(5173) 동시 실행
`- `bun run server` — API 서버만 (`bun --watch run server/index.ts`)
`- `bun run test` — vitest 1회 실행. `bun test`(Bun 내장 러너)는 사용 금지: jsdom/setup 설정이 vitest 전용 (`vite.config.ts` test 블록)
`- `bun run test -- server/fallback.test.ts` — 단일 파일 테스트
`- `bun run lint`, `bun run build` (`tsc -b && vite build`) — 변경 후 둘 다 통과해야 한다
`
`## Golden Rules
`
`Immutable:
`- API 키를 코드/로그/응답에 노출하지 않는다. 서버 환경변수 키는 불리언으로만 클라이언트에 알린다 (`server/index.ts:148-154` `/api/config`). 키 값 자체를 응답에 포함 금지.
`- 클라이언트가 입력한 API 키는 React state에만 둔다 (`src/App.tsx:21`). localStorage/sessionStorage 등에 저장 금지. (provider·히스토리·컴포넌트 목록만 `src/utils/storage.ts`로 저장한다. 이 모듈에 키 관련 항목 추가 금지.)
`- Google 호출 URL에는 키가 쿼리스트링으로 들어간다 (`server/index.ts:99`). 이 URL이나 에러 객체 전체를 로그/응답에 출력 금지.
`- `.env`는 커밋 금지 (`.gitignore`로 제외됨).
`- 민감 파일 읽기/수정 금지: `.env`, `.env.*`, `*credential*`, `*secret*`, `*.pem`, `*.key`, `.npmrc`, `.netrc`, `.ssh/`, `.aws/`, `.claude/settings.local.json`은 Read/Edit은 물론 `cat`/`grep`/`cp`/`source` 같은 Bash 우회도 하지 않는다. `.claude/settings.json`의 `permissions.deny`가 1차 차단하지만 완전하지 않으므로 규칙으로도 지킨다. 환경변수가 필요하면 값을 읽지 말고 사용자에게 설정 여부만 묻는다. `.env.example`도 같은 패턴에 걸리므로 필요하면 사용자에게 요청한다.
`- `permissions.deny` 패턴을 완화/삭제하거나 `.claude/settings.json`을 수정해 차단을 우회하지 않는다. 새 민감 파일 유형이 생기면 deny 목록과 이 규칙을 함께 갱신한다.
`
`Do's & Don'ts (근거 기반):
`- Hard Constraint: 미리보기는 `react-live`의 `noInline` 모드라 코드에 `render(<X />)` 호출이 반드시 있어야 한다 (`src/components/LivePreview.tsx:11`, `server/generator.ts:12-15`). 생성 코드에 `import` 문과 TypeScript 문법이 있으면 실행되지 않는다 (`server/index.ts:11,20` 시스템 프롬프트). 시스템 프롬프트를 수정할 때 이 제약을 유지한다.
`- Double Defense: "코드펜스 금지"와 "render 호출 포함"은 프롬프트(`server/index.ts:12,16`)와 후처리(`stripCodeFences`, `ensureRenderCall`, `server/index.ts:188`) 양쪽에서 막는다. 한쪽만 제거하지 않는다. 모델은 프롬프트를 어기는 경우가 있다.
`- Asymmetry: 모델 폴백은 Google에만 있다 (`GOOGLE_MODELS`, `server/index.ts:5,135`). Anthropic은 단일 모델 (`server/index.ts:77`). 프로바이더를 추가하거나 변경할 때 폴백 필요 여부를 명시적으로 결정한다.
- Hard Constraint: 에러 상태 매핑은 에러 메시지 문자열의 `503`/`429` 포함 여부로 판단한다 (`server/index.ts:194,201`). 새 프로바이더 호출은 에러 메시지에 HTTP 상태 코드를 포함해 throw해야 한다 (예: `Claude API error: ${response.status}`, `server/index.ts:85,112`).
`- Test Boundary: 테스트가 있는 곳은 순수 함수(`server/generator.ts`, `server/fallback.ts`)와 `PromptInput`뿐이다. `server/index.ts`는 `Bun.serve`를 import 시점에 실행하는 부수효과 모듈이라 테스트 불가 (`server/generator.ts:1-2` 주석). 새 서버 로직은 부수효과 없는 별도 모듈로 분리하고 `*.test.ts`를 함께 추가한다.
`- Hard Constraint: 포트 3002는 `server/index.ts:139`와 `vite.config.ts` proxy target 두 곳에 있다. 변경 시 동시에 수정한다.
`- 테스트 파일 위치: `src/**/*.test.{ts,tsx}`, `server/**/*.test.ts`만 수집된다 (`vite.config.ts` `include`).
`
`## Project Context
`
`- 프롬프트로 React 컴포넌트를 생성하고 실시간 미리보기/코드를 보여주는 도구. 상세는 `README.md`.
`- Stack: React 19, TypeScript, Vite, react-live, Bun(API 프록시), vitest + Testing Library(jsdom).
`
`## Standards & References
`
`- 커밋: `타입: 요약` (feat/fix/refactor/chore), 한국어, 제목 50자 내외, 마침표 없음. `.claude/skills/commit/SKILL.md` 참고.
`- 코드 주석과 사용자 노출 메시지는 한국어 (기존 코드 관례).
`- Maintenance Policy: 이 문서의 규칙과 코드가 어긋나는 것을 발견하면 수정을 제안하고, 근거 라인이 바뀌었으면 이 문서를 갱신한다.
