# MK Mecha — 기계설계 자동화 홈페이지

## 🌐 홈페이지 바로가기

| 페이지 | 주소 |
|---|---|
| **고객 페이지** (설계 의뢰 · 3D 컨셉 · 간단 견적) | **[https://mkj5956.github.io/MK_mecha-homepage_Claude/](https://mkj5956.github.io/MK_mecha-homepage_Claude/)** |
| **관리자 페이지** (의뢰함 · 견적 · 도면 · 외주 · 일정) | **[https://mkj5956.github.io/MK_mecha-homepage_Claude/admin.html](https://mkj5956.github.io/MK_mecha-homepage_Claude/admin.html)** |

> 링크를 누르면 바로 열립니다. 새 탭으로 열려면 Ctrl(맥은 ⌘)을 누른 채 클릭하세요.

고객이 **텍스트·손그림·PDF**로 설계를 의뢰하면 → 자동 분석·추가 질문 → **3D 컨셉(작동 애니메이션·간섭 검증·치수 조정)** → **저가/표준/고가 견적** → 접수.
관리자는 **2D 가공도면 자동 생성(치수·주기·BOM, SVG/DXF)** → **외주처 매칭·견적요청·발주** → **수주~납품 일정(간트)** 까지 한 곳에서 관리합니다.

## 운영 비용 원칙: 유료 API 0원

| 구성 | 사용 기술 | 비용 |
|---|---|---|
| 홈페이지 호스팅 | GitHub Pages (정적 사이트, 빌드 불필요) | 무료 |
| 의뢰 접수·파일 저장·메일 알림 | Google Apps Script + 시트 + 드라이브 | 무료 |
| 의뢰 분석·3D·견적·도면·검증 | 브라우저 안에서 실행되는 JS (three.js, 규칙 기반 분석) | 무료 |
| 손글씨/PDF 글자 인식 | tesseract.js, pdf.js (브라우저 내 실행) | 무료 |
| 정밀 분석·스케치 해석·메일 작성 | 관리자 페이지 **AI 도우미** → 프롬프트 복사 → **Claude/ChatGPT 구독 채팅**에 붙여넣기 → 답변 JSON 붙여넣기 | 구독료만 |
| 코드 유지보수 | Claude Code (구독) — `CLAUDE.md` 참고 | 구독료만 |

## 화면 구성

- **고객 페이지** `index.html`: 설계 의뢰(텍스트/이미지/PDF 업로드, OCR) · 자동 분석·질문 · 3D 컨셉 모델(치수 직접 조정, 작동 애니메이션, 검증) · 3단계 간단 견적 · 의뢰인 정보 · 연락처
- **관리자 페이지** `admin.html` (비밀번호, 검색엔진 비노출): 대시보드 · 의뢰함 · 프로젝트(① 분석 ② 견적 ③ 3D 설계 ④ 2D 도면 ⑤ 외주·발주 ⑥ 일정) · 외주처 · 일정 관리 · AI 도우미 · 설정/백업

## 설치 (30분)

1. **회사 정보 수정** — `js/config.js` 에 이메일·전화·회사명 입력.
2. **GitHub Pages 켜기** — 저장소 Settings → Pages → Branch `main` / `(root)` → Save. 몇 분 후 `https://<아이디>.github.io/<저장소>/` 로 접속.
3. **의뢰 접수 서버 연결 (선택이지만 권장)** — [`apps-script/README.md`](apps-script/README.md) 따라 웹앱 URL 발급 후 `js/config.js` 의 `appsScriptUrl` 에 입력.
   미설정 시 고객 의뢰는 "의뢰서 JSON 저장 + 이메일 작성창" 방식으로 전달됩니다.
4. **관리자 비밀번호 변경** — `admin.html` 접속(기본 `admin1234`) → 설정 → 해시 생성 → `js/config.js` 의 `adminPasswordSha256` 교체 후 커밋.
5. **외주처 등록** — 관리자 → 외주처 메뉴에서 예시 업체를 실제 거래처로 교체.
6. **단가 보정** — 설정 메뉴의 시간당 단가·관리비율·보정계수, 또는 `js/kb.js` 의 재질 단가/구매품 가격.

로컬 실행: `python3 -m http.server 8765` → http://localhost:8765

## 업무 흐름

자세한 사용법: [`docs/운영가이드.md`](docs/운영가이드.md)

```
고객 의뢰 ─▶ 의뢰함 ─▶ 프로젝트 전환 ─▶ ① 분석(질문 메일) ─▶ ② 견적 확정·견적서 PDF
   ▲                                          │ (AI 도우미로 정밀 분석/스케치→3D)
   └── 고객 공유 링크(3D 확인·치수 수정 회신) ◀─ ③ 3D 설계·작동 검증·리비전·확정
                                              ▼
            ⑥ 일정(간트) ◀─ ⑤ 외주 매칭·RFQ·발주서 ◀─ ④ 2D 도면 자동생성 (SVG/DXF/BOM ZIP)
```

## 폴더 구조

```
index.html / admin.html      고객 / 관리자 페이지
css/style.css                공통 스타일 (라이트·다크)
js/config.js                 ★ 회사 정보·서버 URL·비밀번호 해시
js/kb.js                     ★ 설계 지식베이스: 재질·가공단가·일반공차·볼트구멍·구매품 카탈로그·제안 규칙
js/templates.js              파라메트릭 설계 템플릿 6종 + 공학 검증 계산
js/engine.js                 운동 계산 + 동적 간섭 검사 (OBB 분리축)
js/analyzer.js               의뢰 텍스트 분석 (유형 판별·수치 추출·질문 생성)
js/estimator.js              3단계 견적 / BOM
js/drawing.js                2D 도면 생성 (KS 3각법, 치수·주기·표제란·BOM, SVG/DXF)
js/viewer.js, designpanel.js 3D 뷰어 / 설계 패널 UI
js/prompts.js                AI 도우미 프롬프트 (구독 채팅용)
js/admin*.js, customer.js    페이지 로직
js/store.js, share.js        저장소(localStorage·Apps Script) / 3D 공유 링크
apps-script/Code.gs          무료 백엔드
tests/                       단위·E2E 테스트
```

## 테스트

```bash
npm test          # 템플릿 전 범위 간섭·견적, 분석기 테스트
npm run test:e2e  # (서버 실행 후) 고객·관리자 화면 E2E — Playwright 필요
```

## 한계 (솔직하게)

- 자동 3D/견적/도면은 **컨셉·사전 견적 수준**입니다. 제작 전 반드시 설계자가 검토하세요. 단가는 참고값이므로 실제 거래 단가로 보정이 필요합니다.
- 손그림 **형상 인식은 브라우저만으로는 불가능**합니다. 글자·치수는 OCR로 읽고, 형상은 AI 도우미 ②번(스케치 → 3D JSON)으로 구독 채팅에서 해석합니다.
- 관리자 데이터는 브라우저(localStorage)에 저장됩니다. **정기 백업**(설정 → 백업)을 하세요. 다른 PC에서는 백업 파일을 복원해 사용합니다.
- 관리자 비밀번호는 화면 잠금 용도입니다. 실제 고객 데이터는 Apps Script 토큰으로 보호되며 공개 저장소에 올라가지 않습니다.
