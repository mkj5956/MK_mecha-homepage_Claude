---
name: serverless-static-web
description: 서버 비용 0원·유료 API 미사용으로 홈페이지/웹앱을 만드는 서버리스 구성 방식. GitHub Pages(정적 호스팅) + 브라우저 JS(클라이언트 처리) + Google Apps Script(무료 백엔드: 시트·드라이브·메일) + localStorage(관리자 데이터) + Claude/ChatGPT 구독 복사·붙여넣기(AI). 사용자가 "서버 없이", "무료로 운영", "API 없이", "구독만으로", "GitHub Pages", "Apps Script", "서버리스 홈페이지", "문의/접수 폼 있는 홈페이지", "관리자 페이지 있는 정적 사이트"를 언급하거나, 소규모 사업자·개인용 홈페이지·접수/견적/예약/주문 폼·내부 관리 도구를 새로 만들 때 사용한다. Use for building zero-cost serverless static websites with a free Google Apps Script backend and no paid AI APIs.
---

# 서버리스 정적 웹사이트 구성법

**목표:** 서버를 직접 사거나 관리하지 않고, 월 비용 0원(AI는 기존 구독료만)으로 운영되는 홈페이지를 만든다.

## 1. 구조 (4개 층)

```
① GitHub Pages ── 파일 보관·전달 (정적 호스팅, 무료, push = 배포)
② 방문자 브라우저 ── 모든 계산·화면·로직 (순수 HTML/CSS/ES 모듈, 빌드 없음)
③ Google Apps Script ── 폼 접수 저장(시트)·첨부(드라이브)·알림(메일) — "유일한 서버"
④ Claude/ChatGPT 구독 ── 관리자가 프롬프트 복사 → 채팅 → 답변(JSON) 붙여넣기 → 앱이 적용
```

| 데이터 종류 | 저장 위치 |
|---|---|
| 공개 콘텐츠·설정·로직 | 저장소 파일 (`js/config.js` 등) |
| 고객 제출 데이터(문의·주문·의뢰) | Apps Script → 구글 시트 / 드라이브 |
| 관리자 작업 데이터 | 관리자 브라우저 localStorage (+ JSON 백업/복원) |
| 고객에게 보낼 결과물(설계안·견적 등) | URL 해시에 압축 (`#c=...`) → 서버 없이 공유 |

## 2. 이 방식이 맞는지 먼저 판단

**적합:** 소규모 사업자 홈페이지, 문의/견적/예약/의뢰 접수, 1~2인이 쓰는 관리자 페이지, 브라우저에서 계산 가능한 도구(계산기·3D·도면·차트), 하루 접수 수백 건 이하.

**부적합 → 사용자에게 한계를 먼저 설명하고 대안 제시:**
- 여러 직원이 실시간으로 같은 데이터를 편집 → 관리자 데이터도 Apps Script/시트로 저장하도록 설계
- 결제·회원가입·로그인 보안이 핵심 → 전문 서비스(토스페이먼츠, Firebase Auth 등) 필요
- 자동 AI 응답이 꼭 필요 → 유료 API가 불가피함을 명시
- 대용량 파일(수십 MB 이상)·하루 수천 건 → Apps Script 한도 초과 (`references/limits.md`)

## 3. 만드는 순서

1. **요구사항을 4개 층에 배분** — 각 기능이 ①~④ 중 어디서 처리되는지 표로 정리해 사용자에게 보여준다.
2. **폴더 구조 생성** (`references/structure.md`)
   - `index.html`(공개) / `admin.html`(관리자, `noindex`) / `css/` / `js/config.js` / `js/*.js` / `apps-script/Code.gs` / `.nojekyll` / `README.md` / `CLAUDE.md`
3. **공통 모듈 복사·수정** (`references/client-snippets.md`)
   - `api.js`: Apps Script POST (`Content-Type: text/plain` 필수)
   - `store.js`: localStorage 저장 + 백업/복원 + 스키마 호환
   - `share.js`: URL 압축 공유 링크
   - `ai-paste.js`: AI 답변에서 JSON 추출·검증·적용
   - `util.js`: `esc()`, 다운로드, 클립보드, SHA-256
4. **백엔드** — `references/apps-script-template.gs`를 복사해 필드만 맞춘다. 설치 안내는 `references/deploy.md`.
5. **관리자 페이지** — 비밀번호 화면 잠금(SHA-256 해시 비교), 목록·상세, 서버에서 가져오기, 백업/복원, 설정(Apps Script URL·토큰).
6. **AI 도우미(선택)** — 데이터를 채운 프롬프트 생성 → 복사 → 채팅 링크 → 답변 붙여넣기 → JSON 적용. **API 호출 코드는 절대 넣지 않는다.**
7. **검증** — 로컬 서버(`python3 -m http.server`) + Playwright로 콘솔 에러 0건, 모바일 폭(390px) 가로 스크롤 없음, 폼 제출(엔드포인트 미설정 시 대체 경로) 확인.
8. **문서** — README(설치 30분 가이드·한계), apps-script/README, CLAUDE.md(유지보수 규칙).

## 4. 반드시 지킬 규칙

- **빌드 도구 없음**: 순수 ES 모듈 + `<script type="importmap">`. 외부 라이브러리는 CDN **고정 버전**만 (예: `three@0.160.0`). 버전 범위(`@latest`, `@1`)는 금지.
- **유료 API 금지**: OpenAI/Anthropic API 키를 코드에 넣지 않는다. AI는 ④ 복사·붙여넣기 방식만 사용한다.
- **비밀값은 저장소에 커밋하지 않는다**: Apps Script 토큰은 관리자 브라우저 설정에만 입력하고, 서버는 Script Properties에 저장한다. 저장소에는 비밀번호 **해시**만 둔다.
- **관리자 비밀번호는 화면 잠금일 뿐**임을 사용자에게 명시한다. 실제 보호 수단은 "데이터가 공개 저장소에 없다"는 것과 "Apps Script 토큰 검증"이다.
- **사용자 입력은 `esc()` 후 innerHTML** (XSS 방지).
- **모든 localStorage 접근은 try/catch** + 백업/복원 기능 필수 + 주 1회 백업 안내.
- **엔드포인트 미설정 시 대체 경로**: 폼 데이터를 JSON 다운로드 + `mailto:` 작성창으로 넘긴다. 사이트가 깨지면 안 된다.
- **스팸 방지**: 숨김 honeypot 필드 + Apps Script 측 CacheService 중복 제출 차단.
- **개인정보**: 수집 동의 체크박스(목적·보유기간 명시)를 넣는다.
- **반응형**: 16px 좌우 여백, 390px 폭에서 가로 스크롤 없음. 다크모드는 CSS 변수로 지원.

## 5. 자주 하는 실수

| 증상 | 원인 / 해결 |
|---|---|
| Apps Script 호출 시 CORS 에러 | `Content-Type: application/json` 사용 → `text/plain;charset=utf-8`로 변경 (preflight 회피) |
| Code.gs 수정했는데 반영 안 됨 | 배포 → 배포 관리 → 편집 → **새 버전**으로 재배포 |
| 시트 저장은 되는데 응답이 이상함 | `ContentService...setMimeType(JSON)` 누락, 또는 웹앱 액세스 권한이 "모든 사용자"가 아님 |
| GitHub Pages에서 `_`로 시작하는 파일 404 | `.nojekyll` 파일 추가 |
| 모듈 import 실패 (로컬 `file://`) | 반드시 http 서버로 열기 |
| 관리자 데이터 사라짐 | 다른 브라우저·시크릿 모드·캐시 삭제 → 백업 복원 |
| 공유 링크가 너무 김 | `CompressionStream('deflate-raw')` + base64url 사용, 큰 데이터는 시트에 저장하고 ID만 공유 |

## 6. 사용자에게 설명할 때 (비개발자용)

> "GitHub는 진열장(파일 보관), 손님의 브라우저가 계산대(실제 계산), 구글은 접수 창구와 서류함(저장·알림), Claude/ChatGPT는 필요할 때 부르는 자문위원입니다. 서버를 직접 운영하지 않아서 월 비용이 0원이에요."

정식 명칭: **서버리스 정적 웹사이트** (JAMstack, 클라이언트 사이드 + BaaS + Local-first + Human-in-the-loop AI)

## 참고 파일
- `references/structure.md` — 폴더 구조, HTML 골격, CSS 토큰
- `references/client-snippets.md` — api / store / share / ai-paste / util 코드
- `references/apps-script-template.gs` — 범용 백엔드 (submit / list / update / ping)
- `references/deploy.md` — GitHub Pages + Apps Script 설치 절차(사용자 안내용)
- `references/limits.md` — 무료 한도와 확장 경로
