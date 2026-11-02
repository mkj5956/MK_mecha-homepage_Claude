# 폴더 구조 · HTML 골격

```
project/
├─ index.html            공개 페이지
├─ admin.html            관리자 (meta robots noindex)
├─ css/style.css         공통 스타일 (CSS 변수 + 다크모드)
├─ js/
│  ├─ config.js          ★ 회사정보·연락처·appsScriptUrl·adminPasswordSha256
│  ├─ util.js            esc, download, copyText, sha256, toast, fileToBase64
│  ├─ api.js             Apps Script 통신
│  ├─ store.js           localStorage DB + 백업/복원
│  ├─ share.js           URL 압축 공유 링크 (선택)
│  ├─ ai-paste.js        AI 답변 JSON 추출·적용 (선택)
│  ├─ public.js          공개 페이지 로직
│  └─ admin.js           관리자 로직 (해시 라우터 #/view/id)
├─ apps-script/
│  ├─ Code.gs            무료 백엔드
│  └─ README.md          설치 안내
├─ tests/                Playwright 스모크 테스트 (.cjs)
├─ .nojekyll
├─ package.json          {"type":"module", scripts: serve/test}
├─ README.md             설치·운영·한계
└─ CLAUDE.md             유지보수 규칙 (유료 API 금지, CDN 고정 버전 등)
```

## config.js
```js
export const CONFIG = {
  company: '회사명', email: 'you@example.com', phone: '010-0000-0000',
  appsScriptUrl: '',            // 비우면 mailto + JSON 다운로드 대체 경로
  adminPasswordSha256: '...',   // 관리자 설정 화면에서 생성 → 붙여넣기
  maxUploadMB: 15,
};
```

## HTML 골격
```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>회사명</title>
  <!-- admin.html 에만 --> <meta name="robots" content="noindex, nofollow">
  <link rel="stylesheet" href="css/style.css">
  <script type="importmap">
  { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js" } }
  </script>
</head>
<body>
  ...
  <script type="module" src="js/public.js"></script>
</body>
</html>
```

## CSS 토큰 (라이트/다크)
```css
:root { --bg:#f6f7f9; --surface:#fff; --text:#18202a; --muted:#5d6773; --line:#dde2e8; --accent:#e8710a; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --bg:#0e1116; --surface:#161b22; --text:#e6e9ee; --muted:#9aa4b0; --line:#2a313b; --accent:#ff8a2a; }
}
:root[data-theme="dark"] { /* 위와 동일 */ }
body { background: var(--bg); color: var(--text); margin: 0; }
.wrap { max-width: 1200px; margin: 0 auto; padding: 0 16px; }
```

## 관리자 해시 라우터
```js
window.addEventListener('hashchange', route);
function route() {
  const [, view = 'dashboard', id] = (location.hash || '#/dashboard').split('/');
  main.innerHTML = '';
  ({ dashboard, list, detail: () => detail(id), settings }[view] || dashboard)();
}
```

## 비밀번호 화면 잠금
```js
import { sha256 } from './util.js';
if (sessionStorage.getItem('admin') === '1') enter();
form.onsubmit = async (e) => {
  e.preventDefault();
  if (await sha256(pw.value) === CONFIG.adminPasswordSha256) { sessionStorage.setItem('admin', '1'); enter(); }
};
```
