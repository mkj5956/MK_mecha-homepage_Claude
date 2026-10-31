// 공통 유틸리티
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function download(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove(); return ok;
  }
}

export function toast(msg, ms = 2600) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), ms);
}

export const today = () => new Date().toISOString().slice(0, 10);
export function addDays(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
export function daysBetween(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); }

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

/** AI 답변 등에서 첫 JSON 블록 추출 */
export function extractJSON(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const src = fence ? fence[1] : text;
  const start = src.indexOf('{');
  if (start < 0) throw new Error('JSON 객체를 찾을 수 없습니다.');
  let depth = 0, inStr = false, escp = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (escp) escp = false; else if (c === '\\') escp = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return JSON.parse(src.slice(start, i + 1)); }
  }
  throw new Error('JSON 괄호가 닫히지 않았습니다.');
}

/** 인쇄용 새 창 */
export function printDoc(title, bodyHtml) {
  const w = window.open('', '_blank');
  if (!w) { alert('팝업이 차단되었습니다. 팝업을 허용해 주세요.'); return; }
  w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>body{font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#111;margin:24px;font-size:13px}
  h1{font-size:24px;text-align:center;letter-spacing:8px;border-bottom:3px double #111;padding-bottom:8px}
  table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #444;padding:6px 8px;text-align:left;vertical-align:top}
  th{background:#eef1f5}.r{text-align:right}.c{text-align:center}.muted{color:#555;font-size:12px}
  .sign{display:flex;justify-content:flex-end;gap:0}.sign div{border:1px solid #444;width:80px;height:60px;text-align:center;font-size:11px}
  @media print{button{display:none}}</style></head><body>${bodyHtml}
  <p><button onclick="print()">인쇄 / PDF 저장</button></p></body></html>`);
  w.document.close();
}
