# 클라이언트 공통 모듈

## util.js
```js
export const $ = (s, r = document) => r.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export function download(name, content, mime = 'text/plain;charset=utf-8') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type: mime }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
export async function copyText(t) { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } }
export async function sha256(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
export const fileToBase64 = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });
```

## api.js — Apps Script 통신
```js
import { CONFIG } from './config.js';
async function post(payload, url = CONFIG.appsScriptUrl) {
  if (!url) throw new Error('Apps Script URL 미설정');
  // text/plain → CORS preflight 없음 (Apps Script 필수 패턴)
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), redirect: 'follow' });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || '서버 오류');
  return j;
}
export const api = {
  has: () => !!CONFIG.appsScriptUrl,
  submit: (data) => post({ action: 'submit', data }),
  list: (token, url) => post({ action: 'list', token }, url),
  update: (token, id, patch, url) => post({ action: 'update', token, id, patch }, url),
  ping: (token, url) => post({ action: 'ping', token }, url),
};
```

### 폼 제출 + 대체 경로
```js
form.onsubmit = async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(form));
  if (d.website) return;                         // honeypot
  const payload = { customer: { name: d.name, email: d.email, phone: d.phone }, message: d.message, files: [] };
  if (api.has()) {
    for (const f of fileInput.files) payload.files.push({ name: f.name, type: f.type, data: await fileToBase64(f) });
    const r = await api.submit(payload); showDone(r.id);
  } else {
    const id = 'REQ-' + Date.now();
    download(`${id}.json`, JSON.stringify(payload, null, 2), 'application/json');
    location.href = `mailto:${CONFIG.email}?subject=${encodeURIComponent('[문의] ' + id)}&body=${encodeURIComponent(d.message + '\n\n※ 저장된 JSON 파일을 첨부해 주세요.')}`;
  }
};
```

## store.js — localStorage DB
```js
const KEY = 'app_db_v1';
const blank = () => ({ version: 1, items: [], settings: { appsScriptUrl: '', token: '' } });
export const db = {
  data: null,
  load() {
    try { this.data = JSON.parse(localStorage.getItem(KEY)) || blank(); } catch { this.data = blank(); }
    const b = blank();                                       // 스키마 확장 시 기존 데이터 호환
    for (const k of Object.keys(b)) if (this.data[k] === undefined) this.data[k] = b[k];
    this.data.settings = { ...b.settings, ...this.data.settings };
    return this.data;
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); return true; } catch (e) { alert('저장 실패: 백업 후 정리하세요. ' + e.message); return false; } },
  exportJSON() { return JSON.stringify(this.data, null, 2); },
  importJSON(text) { const d = JSON.parse(text); if (!d || !Array.isArray(d.items)) throw new Error('잘못된 백업'); localStorage.setItem(KEY, JSON.stringify(d)); this.load(); },
};
```

## share.js — URL 압축 공유 링크 (서버 없이 결과물 전달)
```js
const b64u = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
export async function encode(obj) {
  const s = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return b64u(new Uint8Array(await new Response(s).arrayBuffer()));
}
export async function decode(str) {
  const s = new Blob([unb64u(str)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return JSON.parse(await new Response(s).text());
}
// 사용: `${location.origin}${location.pathname.replace(/admin\.html$/, '')}index.html#c=${await encode(data)}`
// 큰 배열에선 String.fromCharCode(...u8) 대신 루프 사용
```

## ai-paste.js — 구독형 AI 연동 (API 미사용)
```js
// 1) 프롬프트 생성: 역할 + 데이터 + "마지막에 ```json 코드블록 하나" 출력 형식 명시
export function buildPrompt(role, data, schema) {
  return `${role}\n\n[데이터]\n${JSON.stringify(data, null, 2)}\n\n[출력] 설명은 짧게, 마지막에 아래 형식 JSON 코드블록 하나:\n\`\`\`json\n${schema}\n\`\`\``;
}
// 2) 답변에서 첫 JSON 객체 추출 (코드펜스 유무 무관)
export function extractJSON(text) {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/i), src = m ? m[1] : text;
  const i = src.indexOf('{'); if (i < 0) throw new Error('JSON 없음');
  let d = 0, s = false, e = false;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (s) { if (e) e = false; else if (c === '\\') e = true; else if (c === '"') s = false; continue; }
    if (c === '"') s = true; else if (c === '{') d++; else if (c === '}' && --d === 0) return JSON.parse(src.slice(i, k + 1));
  }
  throw new Error('JSON 괄호 불일치');
}
// 3) 적용 전 검증 → 이전 값 보관(되돌리기) → 적용. 실패 시 "JSON만 다시 출력해줘" 안내
```
UI: [프롬프트 textarea] [복사] [Claude 열기 ↗ https://claude.ai/new] [ChatGPT 열기 ↗ https://chatgpt.com/] / [답변 붙여넣기 textarea] [적용]

## 인쇄용 문서 (견적서·발주서 → PDF 저장)
```js
const w = window.open('', '_blank');
w.document.write(`<!doctype html><meta charset="utf-8"><title>견적서</title><style>@media print{button{display:none}}</style>${html}<button onclick="print()">인쇄/PDF</button>`);
w.document.close();
```

## 브라우저 내 무료 처리 라이브러리 (CDN 고정 버전)
| 용도 | 라이브러리 |
|---|---|
| 3D | three@0.160.0 (importmap) |
| PDF 텍스트·렌더 | pdfjs-dist@4.4.168 (`build/pdf.min.mjs`, worker 지정) |
| OCR (한글) | tesseract.js@5.1.1 (`createWorker(['kor','eng'])`, 지연 로딩) |
| ZIP | jszip 3.10.1 (cdnjs, script 태그 지연 로딩) |
| 차트 | chart.js@4.4.1 |
