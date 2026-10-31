# CLAUDE.md — 유지보수 안내 (Claude Code용)

정적 사이트(빌드 없음, 순수 ES 모듈). GitHub Pages로 배포. **유료 API 호출 코드 추가 금지** (운영 원칙: 구독만으로 운영).
외부 라이브러리는 CDN 고정 버전만 사용: three@0.160.0, pdfjs-dist@4.4.168, tesseract.js@5.1.1, jszip 3.10.1.

## 핵심 데이터 흐름
`design {type, params, parts?, title}` → `buildDesign()` (templates.js) → `built {parts, period, checks, template, params}`
→ viewer.js(3D) / engine.js(`checkCollisions`) / estimator.js(`estimate`, `bomRows`) / drawing.js(`drawingSet`, `toSVG`, `toDXF`)

## 부품 규약 (templates.js 상단 주석 참고)
- 단위 mm, Z-up, 원점 바닥 중앙, 정면 = -Y. `pos` = 부품 중심.
- `shape: 'box'(size) | 'cyl'(d,len,axis)`, `pn` 같으면 같은 도면·BOM 합산, `std` = 구매품(`spec`, `price[3]`).
- 운동: `motion: [{kind:'kf'|'loop'|'rot'|'spin'}]`, `follow`, 정상 접촉은 `ignore`, 이송물은 `role:'work'`.
- 용접 프레임 등 속이 빈 큰 부재는 `hollow`(체적 비율)로 원가 왜곡 방지.

## 새 템플릿 추가 방법
1. `TEMPLATES` 에 `{key, name, automated, designHours, keywords, params, questions, build(p), checks(p)}` 추가.
2. `build` 는 부품끼리 실제로 겹치지 않게 배치 (정상 접촉은 `ignore`).
3. `npm test` — 모든 템플릿의 min/def/max 파라미터에서 **간섭 0건**이어야 통과 (def 기준 실패 시 exit 1).
4. `tests/analyzer.test.mjs` 에 의뢰 문장 케이스 추가.

## 자주 바꾸는 곳
- 회사 정보·서버 URL·비밀번호 해시: `js/config.js`
- 재질 단가, 가공 시간당 단가, 구매품 가격, 제안 규칙, 공통 질문: `js/kb.js`
- 견적 공식: `js/estimator.js` / 도면 주기: `drawing.js` `autoNotes()`
- AI 도우미 프롬프트: `js/prompts.js`

## 검증
```bash
python3 -m http.server 8765 &
npm test && npm run test:e2e
```
E2E는 Playwright(chromium) 필요. 콘솔 에러 0건이어야 합니다.

## 주의
- 사용자 입력은 항상 `esc()` 로 이스케이프 후 innerHTML.
- 관리자 데이터 스키마(store.js `blank()`)를 바꾸면 `load()` 에서 기존 데이터 호환 유지.
- 고객 개인정보를 저장소 파일에 커밋하지 말 것.
