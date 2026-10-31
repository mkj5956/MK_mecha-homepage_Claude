// =============================================================
//  관리자 — 프로젝트 작업공간
//  ① 분석·질문 ② 견적 ③ 3D 설계·검증 ④ 2D 도면 ⑤ 외주·발주 ⑥ 일정
// =============================================================
import { CONFIG } from './config.js';
import { db } from './store.js';
import { $, esc, toast, download, today, addDays, uid, copyText, printDoc } from './util.js';
import { analyze } from './analyzer.js';
import { buildDesign, getTemplate } from './templates.js';
import { estimate, bomRows, won, manwon } from './estimator.js';
import { mountDesignPanel } from './designpanel.js';
import { drawingSet, toSVG, toDXF } from './drawing.js';
import { MATERIALS, PROCESSES } from './kb.js';
import { shareUrl } from './share.js';
import { ganttSVG, scheduleRows, generateSchedule, matchVendors } from './admin-ops.js';

const TABS = [['analysis', '① 분석·질문'], ['quote', '② 견적'], ['design', '③ 3D 설계·검증'], ['drawing', '④ 2D 도면'], ['outsource', '⑤ 외주·발주'], ['schedule', '⑥ 일정']];

/** 설계 + AI/관리자 오버라이드(재질·공정·주기) 적용 */
export function buildProject(p) {
  const built = buildDesign(p.design);
  for (const part of built.parts) {
    const o = p.overrides?.[part.pn];
    if (o) { if (o.mat && MATERIALS[o.mat]) part.mat = o.mat; if (o.proc && PROCESSES[o.proc]) part.proc = o.proc; }
    if (p.extraNotes?.[part.pn]) part.extraNotes = p.extraNotes[part.pn];
  }
  return built;
}
const meta = (p) => ({ company: CONFIG.companyKo, designer: db.data.settings.designer, date: today(), projectNo: p.no, projectTitle: p.title, qty: p.qty || 1 });

export function renderProject(main, p, tab, ctx) {
  const save = () => db.save();
  main.innerHTML = `
    <div class="row between">
      <div><h2 style="margin:0">${esc(p.no)} · ${esc(p.title)}</h2>
      <p class="muted" style="margin:2px 0 0">${esc(p.customer?.company || '')} ${esc(p.customer?.name || '')} · ${esc(p.customer?.phone || '')} · ${p.customer?.email ? `<a href="mailto:${esc(p.customer.email)}">${esc(p.customer.email)}</a>` : ''}</p></div>
      <div class="row"><label class="field" style="margin:0"><select id="status" aria-label="상태">${ctx.STATUSES.map((s) => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <a class="btn ghost sm" href="#/ai/${p.id}">🤖 AI 도우미</a><button class="btn ghost sm" id="delP">삭제</button></div>
    </div>
    <div class="tabs">${TABS.map(([k, n]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${n}</button>`).join('')}</div>
    <div id="tabBody"></div>`;
  $('#status').onchange = (e) => { p.status = e.target.value; save(); toast('상태 변경: ' + p.status); };
  $('#delP').onclick = () => { if (confirm(`${p.no} 프로젝트를 삭제할까요?`)) { db.data.projects = db.data.projects.filter((x) => x !== p); save(); ctx.go('#/projects'); } };
  main.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => ctx.go(`#/project/${p.id}/${b.dataset.tab}`));
  const body = $('#tabBody');
  ({ analysis: tabAnalysis, quote: tabQuote, design: tabDesign, drawing: tabDrawing, outsource: tabOutsource, schedule: tabSchedule }[tab] || tabAnalysis)(body, p, ctx, save);
}

// ---------------- ① 분석 ----------------
function tabAnalysis(el, p, ctx, save) {
  const r = p.request || {}, a = p.analysis || {};
  el.innerHTML = `<div class="grid2">
    <div class="card"><h4>고객 의뢰 원문</h4>
      <label class="field"><span>제품명</span><input id="rTitle" value="${esc(r.title || p.title)}"></label>
      <label class="field"><span>요구사항</span><textarea id="rText" rows="9">${esc(r.text || '')}</textarea></label>
      <div class="grid2"><label class="field"><span>수량</span><input id="rQty" type="number" min="1" value="${p.qty || 1}"></label><label class="field"><span>희망 납기</span><input id="rDue" type="date" value="${esc(r.deadline || '')}"></label></div>
      ${(r.files || []).length ? `<h4>첨부 파일</h4>${r.files.map((f) => `<div><a href="${esc(f.url || '#')}" target="_blank" rel="noopener">📎 ${esc(f.name)}</a></div>`).join('')}<p class="muted">손그림은 AI 도우미 ②번 프롬프트와 함께 Claude/ChatGPT 채팅창에 첨부하세요.</p>` : ''}
      ${r.etc ? `<p><b>기타:</b> ${esc(r.etc)}</p>` : ''}
      <div class="row"><button class="btn sm" id="reAn">💾 저장 후 재분석</button><a class="btn ghost sm" href="#/ai/${p.id}">🤖 AI 정밀 분석 프롬프트</a></div></div>
    <div class="card"><h4>자동 분석 결과 <span class="badge">${esc(a.typeName || getTemplate(p.design.type).name)}</span></h4>
      <ul class="evidence">${(a.evidence || []).map((e) => `<li>${esc(e)}</li>`).join('') || '<li>추출된 수치 없음</li>'}</ul>
      <h4 style="margin-top:12px">설계 제안</h4><ul class="sugg">${(a.suggestions || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      <h4 style="margin-top:12px">고객 확인 질문 <button class="link" id="cpQ">복사</button></h4>
      <ol style="font-size:14px;padding-left:20px" id="qList">${(a.questions || []).map((q) => `<li>${esc(q)}${r.answers ? '' : ''}</li>`).join('')}</ol>
      ${Object.keys(r.answers || {}).length ? `<h4>고객 답변</h4><ul class="evidence">${Object.entries(r.answers).filter(([, v]) => v).map(([k, v]) => `<li>${esc(k)}: ${esc(v)}</li>`).join('')}</ul>` : ''}
      ${(p.aiNotes || []).map((n) => `<div class="vrow info"><b>🤖 AI (${esc(n.kind)} · ${esc(n.at.slice(0, 10))})</b>${['questions', 'suggestions', 'risks', 'assumptions'].map((k) => (n[k] || []).length ? `<span class="sub"><b>${k}</b>: ${n[k].map(esc).join(' / ')}</span>` : '').join('')}${n.text ? `<span class="sub">${esc(n.text.slice(0, 600))}</span>` : ''}</div>`).join('')}
      <label class="field" style="margin-top:12px"><span>상담 메모</span><textarea id="notes" rows="4">${esc(p.notes || '')}</textarea></label>
      <button class="btn ghost sm" id="mailQ">✉ 질문 메일 보내기</button></div></div>`;
  $('#reAn').onclick = () => {
    p.title = $('#rTitle').value; p.request = { ...r, title: p.title, text: $('#rText').value, deadline: $('#rDue').value }; p.qty = +$('#rQty').value || 1;
    const an = analyze(`${p.title}\n${p.request.text}`);
    p.analysis = { typeName: an.typeName, confidence: an.confidence, suggestions: an.suggestions, questions: an.questions.map((q) => q.q), evidence: an.evidence };
    if (confirm(`분석 결과 "${an.typeName}" 템플릿과 추출 치수로 3D 설계를 갱신할까요?\n(취소 시 기존 설계 유지)`)) { p.revisions.push({ at: new Date().toISOString(), note: '재분석 전', design: p.design }); p.design = { type: an.type, params: an.params }; }
    save(); ctx.route();
  };
  $('#notes').onchange = (e) => { p.notes = e.target.value; save(); };
  const qText = () => (p.analysis?.questions || []).map((q, i) => `${i + 1}. ${q}`).join('\n');
  $('#cpQ').onclick = async () => { await copyText(qText()); toast('질문 목록을 복사했습니다.'); };
  $('#mailQ').onclick = () => { location.href = `mailto:${p.customer?.email || ''}?subject=${encodeURIComponent(`[${CONFIG.company}] ${p.title} 설계 관련 확인 요청 (${p.no})`)}&body=${encodeURIComponent(`${p.customer?.name || '고객'}님 안녕하세요, ${CONFIG.companyKo} ${db.data.settings.designer}입니다.\n\n의뢰해 주신 "${p.title}" 설계를 위해 아래 사항 확인 부탁드립니다.\n\n${qText()}\n\n감사합니다.\n${CONFIG.phone}`)}`; };
}

// ---------------- ② 견적 ----------------
export function quoteText(q) { return q.map((t) => `[${t.name}] 합계 ${won(t.total)}\n` + t.lines.map((l) => `  - ${l.cat}: ${won(l.amount)} ${l.note}`).join('\n')).join('\n'); }
function tabQuote(el, p, ctx, save) {
  const built = buildProject(p);
  const q = estimate(built, { qty: p.qty || 1, rates: db.data.settings.rates });
  const cats = q[0].lines.map((l) => l.cat);
  el.innerHTML = `<div class="row" style="margin-bottom:12px"><label class="field" style="margin:0;width:120px"><span>수량</span><input id="qQty" type="number" min="1" value="${p.qty || 1}"></label>
    <span class="muted" style="margin-top:18px">설계안: ${esc(getTemplate(p.design.type).name)} · 단가는 설정 메뉴에서 조정 · 부가세 별도</span></div>
    <div class="grid3">${q.map((t) => `<div class="card tier ${p.tier === t.key ? 'on' : ''}" data-tier="${t.key}"><span class="badge">${t.name}</span><div class="price">${manwon(t.total)}</div><div class="rng">${esc(t.desc)}</div></div>`).join('')}</div>
    <div class="card scroll-x" style="margin-top:16px"><table class="tbl"><tr><th>항목</th>${q.map((t) => `<th class="r">${t.name}</th>`).join('')}<th>산출 근거(표준형)</th></tr>
      ${cats.map((c, i) => `<tr><td>${c}</td>${q.map((t) => `<td class="r">${won(t.lines[i].amount)}</td>`).join('')}<td class="muted">${esc(q[1].lines[i].note)}</td></tr>`).join('')}
      <tr class="total"><td>합계 (VAT 별도)</td>${q.map((t) => `<td class="r">${won(t.total)}</td>`).join('')}<td></td></tr></table></div>
    <div class="card scroll-x" style="margin-top:16px"><h4>부품별 원가 (표준형, 1대 기준)</h4><table class="tbl"><tr><th>No</th><th>품명</th><th class="r">수량</th><th class="r">단가</th><th class="r">금액</th><th>구분</th></tr>
      ${q[1].partLines.map((l) => `<tr><td>${l.no}</td><td>${esc(l.name)}</td><td class="r">${l.qty}</td><td class="r">${won(l.unit)}</td><td class="r">${won(l.amount)}</td><td>${l.std ? '구매품' : '가공품'}</td></tr>`).join('')}</table></div>
    <div class="row" style="margin-top:16px"><button class="btn" id="fix">✔ 선택 등급으로 견적 확정</button><button class="btn ghost" id="print">🖨 견적서 출력/PDF</button><button class="btn ghost" id="mail">✉ 고객에게 견적 메일</button>
    ${p.quoteSnapshot ? `<span class="badge ok">확정: ${esc(p.quoteSnapshot.tierName)} ${manwon(p.quoteSnapshot.total)} (${esc(p.quoteSnapshot.at)})</span>` : ''}</div>`;
  el.querySelectorAll('[data-tier]').forEach((c) => c.onclick = () => { p.tier = c.dataset.tier; save(); ctx.route(); });
  $('#qQty').onchange = (e) => { p.qty = Math.max(1, +e.target.value || 1); save(); ctx.route(); };
  const sel = q.find((t) => t.key === p.tier) || q[1];
  $('#fix').onclick = () => { p.quoteSnapshot = { tier: sel.key, tierName: sel.name, total: sel.total, at: today(), lines: sel.lines }; if (p.status === '상담') p.status = '견적'; save(); toast('견적을 확정했습니다.'); ctx.route(); };
  $('#print').onclick = () => printQuote(p, sel, built);
  $('#mail').onclick = () => { location.href = `mailto:${p.customer?.email || ''}?subject=${encodeURIComponent(`[${CONFIG.company}] ${p.title} 견적 안내 (${p.no})`)}&body=${encodeURIComponent(`${p.customer?.name || '고객'}님 안녕하세요.\n요청하신 "${p.title}" 견적을 안내드립니다. (VAT 별도)\n\n${q.map((t) => `· ${t.name}: ${manwon(t.total)} — ${t.desc}`).join('\n')}\n\n상세 견적서(PDF)를 첨부드립니다. 검토 후 회신 부탁드립니다.\n\n${CONFIG.companyKo} ${db.data.settings.designer} / ${CONFIG.phone}`)}`; };
}
function printQuote(p, t, built) {
  const rows = bomRows(built.parts);
  printDoc(`견적서_${p.no}`, `<h1>견 적 서</h1>
  <table><tr><th style="width:15%">견적번호</th><td>${esc(p.no)}-Q</td><th style="width:15%">견적일자</th><td>${today()}</td></tr>
  <tr><th>수신</th><td>${esc(p.customer?.company || '')} ${esc(p.customer?.name || '')} 귀하</td><th>공급자</th><td>${esc(CONFIG.companyKo)} ${esc(CONFIG.bizNo)}<br>${esc(CONFIG.phone)} · ${esc(CONFIG.email)}</td></tr>
  <tr><th>건명</th><td colspan="3">${esc(p.title)} — ${esc(t.name)} (${p.qty || 1}대)</td></tr>
  <tr><th>합계금액</th><td colspan="3" style="font-size:18px"><b>${won(t.total)}</b> (VAT 별도) / VAT 포함 ${won(t.total * 1.1)}</td></tr></table>
  <table><tr><th>항목</th><th class="r">금액</th><th>비고</th></tr>${t.lines.map((l) => `<tr><td>${l.cat}</td><td class="r">${won(l.amount)}</td><td class="muted">${esc(l.note)}</td></tr>`).join('')}
  <tr><th>합계</th><th class="r">${won(t.total)}</th><th></th></tr></table>
  <h3>주요 구성 (B.O.M 요약)</h3><table><tr><th>No</th><th>품명</th><th>재질/규격</th><th class="c">수량</th></tr>${rows.map((r) => `<tr><td>${r.no}</td><td>${esc(r.name)}</td><td>${esc(r.matText)}</td><td class="c">${r.qty}</td></tr>`).join('')}</table>
  <p class="muted">· 견적 유효기간: 발행일로부터 30일 · 납기: 계약 후 협의 · 결제: 계약금 30% / 중도금 40% / 잔금 30%(납품 후)<br>
  · 설치·출장비, 인증 비용, 사양 변경에 따른 추가 비용은 별도 협의합니다.</p>`);
}

// ---------------- ③ 3D 설계 ----------------
function tabDesign(el, p, ctx, save) {
  el.innerHTML = `<div id="dp"></div>
  <div class="grid2" style="margin-top:16px">
    <div class="card"><h4>고객 공유 · 확정</h4>
      <p class="muted">공유 링크에는 설계 데이터가 압축되어 들어있어 서버 없이 고객이 3D 모델을 보고 치수를 조정해 회신할 수 있습니다.</p>
      <div class="row"><button class="btn sm" id="share">🔗 공유 링크 생성</button><button class="btn ghost sm" id="rev">💾 리비전 저장</button>
      <button class="btn ghost sm" id="confirmD">${p.confirmed ? '✔ 설계 확정됨 (해제)' : '✔ 설계 확정 → 도면 단계'}</button></div>
      <div id="shareOut" style="margin-top:10px"></div></div>
    <div class="card"><h4>리비전 이력</h4>${(p.revisions || []).slice().reverse().map((r, i) => `<div class="vrow info"><b>${esc(r.at.slice(0, 16).replace('T', ' '))} — ${esc(r.note || '')}</b><span>${esc(getTemplate(r.design?.type).name)} <button class="link" data-restore="${p.revisions.length - 1 - i}">복원</button></span></div>`).join('') || '<p class="muted">저장된 리비전이 없습니다.</p>'}</div>
  </div>`;
  let t;
  const panel = mountDesignPanel($('#dp'), { design: p.design, onChange: (d) => { p.design = d; clearTimeout(t); t = setTimeout(save, 400); } });
  ctx.cleanups.push(() => { clearTimeout(t); save(); panel.viewer.dispose(); });
  $('#share').onclick = async () => {
    const url = await shareUrl({ ...p.design, no: p.no, title: p.title });
    $('#shareOut').innerHTML = `<input readonly value="${esc(url)}" onclick="this.select()"><div class="row" style="margin-top:6px"><button class="btn sm" id="cp">복사</button><a class="btn ghost sm" target="_blank" rel="noopener" href="${esc(url)}">미리보기</a><button class="btn ghost sm" id="ml">✉ 고객에게 메일</button></div><p class="muted">링크 길이 ${url.length}자</p>`;
    $('#cp').onclick = async () => { await copyText(url); toast('복사했습니다.'); };
    $('#ml').onclick = () => { location.href = `mailto:${p.customer?.email || ''}?subject=${encodeURIComponent(`[${CONFIG.company}] ${p.title} 3D 컨셉 모델 확인 요청 (${p.no})`)}&body=${encodeURIComponent(`${p.customer?.name || '고객'}님 안녕하세요.\n요청하신 "${p.title}"의 3D 컨셉 모델입니다. 아래 링크에서 작동 애니메이션과 치수를 확인하시고, 필요하면 직접 크기를 조정한 뒤 페이지 하단에서 수정 요청을 보내주세요.\n\n${url}\n\n${CONFIG.companyKo} ${db.data.settings.designer}`)}`; };
  };
  $('#rev').onclick = () => { const note = prompt('리비전 메모', `Rev.${(p.revisions?.length || 0) + 1}`); if (note === null) return; p.revisions.push({ at: new Date().toISOString(), note, design: structuredClone(panel.design) }); save(); ctx.route(); };
  $('#confirmD').onclick = () => {
    const v = panel.verifyResult;
    if (!p.confirmed && v && (v.collisions.collisions.length || v.checks.some((c) => !c.ok)) && !confirm('검증에서 문제(간섭/공학 검토)가 발견되었습니다. 그래도 확정할까요?')) return;
    p.confirmed = !p.confirmed; if (p.confirmed && ['상담', '견적'].includes(p.status)) p.status = '설계';
    if (p.confirmed) p.revisions.push({ at: new Date().toISOString(), note: '설계 확정', design: structuredClone(panel.design) });
    save(); ctx.go(`#/project/${p.id}/${p.confirmed ? 'drawing' : 'design'}`);
  };
  el.querySelectorAll('[data-restore]').forEach((b) => b.onclick = () => { const r = p.revisions[+b.dataset.restore]; if (confirm('이 리비전으로 복원할까요?')) { p.design = structuredClone(r.design); save(); ctx.route(); } });
}

// ---------------- ④ 2D 도면 ----------------
let JSZipP = null;
function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  JSZipP = JSZipP || new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = () => res(window.JSZip); s.onerror = rej; document.head.appendChild(s); });
  return JSZipP;
}
function bomCSV(built, set) {
  const no = new Map(set.filter((d) => d.pn).map((d) => [d.pn, d.dwgNo]));
  const rows = bomRows(built.parts).map((r) => [r.no, r.name, no.get(r.pn) || '', r.matText, r.sizeText || '', r.qty, r.procText, r.massKg ? r.massKg.toFixed(2) : '']);
  return '﻿' + [['No', '품명', '도번', '재질/규격', '치수', '수량', '공정', '중량(kg)'], ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}
function tabDrawing(el, p) {
  const built = buildProject(p);
  const set = drawingSet(built, meta(p));
  let cur = 0;
  el.innerHTML = `${p.confirmed ? '' : '<p class="badge warn" style="margin-bottom:10px">설계 미확정 — 3D 설계 탭에서 확정 후 도면을 배포하세요.</p>'}
  <div class="row" style="margin-bottom:12px"><button class="btn sm" id="zip">📦 전체 도면 ZIP (SVG+DXF+BOM)</button><button class="btn ghost sm" id="csv">BOM CSV</button>
  <span class="muted">총 ${set.length}장 (조립도 1 + 부품도 ${set.length - 1}) · KS 3각법 · A3</span></div>
  <div class="dwg-list"><ul id="dl">${set.map((d, i) => `<li data-i="${i}" class="${i === 0 ? 'on' : ''}"><b>${esc(d.dwgNo)}</b>${esc(d.title)}${d.qty ? ` · ${d.qty}EA` : ''}</li>`).join('')}</ul>
  <div><div class="row" style="margin-bottom:8px"><button class="btn ghost sm" id="svg">SVG</button><button class="btn ghost sm" id="dxf">DXF (CAD)</button><button class="btn ghost sm" id="pr">🖨 인쇄 / PDF</button></div>
  <div class="dwg-view" id="dv"></div></div></div>`;
  const show = () => { $('#dv').innerHTML = toSVG(set[cur]); el.querySelectorAll('#dl li').forEach((li) => li.classList.toggle('on', +li.dataset.i === cur)); };
  el.querySelectorAll('#dl li').forEach((li) => li.onclick = () => { cur = +li.dataset.i; show(); });
  show();
  const fname = (d) => `${d.dwgNo}_${d.title}`.replace(/[\\/:*?"<>| ]+/g, '_');
  $('#svg').onclick = () => download(fname(set[cur]) + '.svg', toSVG(set[cur]), 'image/svg+xml');
  $('#dxf').onclick = () => download(fname(set[cur]) + '.dxf', toDXF(set[cur]), 'application/dxf');
  $('#csv').onclick = () => download(`${p.no}_BOM.csv`, bomCSV(built, set), 'text/csv;charset=utf-8');
  $('#pr').onclick = () => {
    const w = window.open('', '_blank'); if (!w) return toast('팝업을 허용해 주세요.');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(set[cur].dwgNo)}</title><style>@page{size:A3 landscape;margin:0}body{margin:0}svg{width:420mm;height:297mm;display:block;page-break-after:always}</style></head><body>${set.map(toSVG).join('')}<script>onload=()=>print()<\/script></body></html>`);
    w.document.close();
  };
  $('#zip').onclick = async () => {
    try {
      const JSZip = await loadJSZip(); const z = new JSZip();
      for (const d of set) { z.file(`SVG/${fname(d)}.svg`, toSVG(d)); z.file(`DXF/${fname(d)}.dxf`, toDXF(d)); }
      z.file(`${p.no}_BOM.csv`, bomCSV(built, set));
      download(`${p.no}_도면세트.zip`, await z.generateAsync({ type: 'blob' }));
    } catch (err) { toast('ZIP 생성 실패: ' + err.message); }
  };
}

// ---------------- ⑤ 외주·발주 ----------------
export function outsourceGroups(built) {
  const rows = bomRows(built.parts);
  const groups = {};
  for (const r of rows) {
    const key = r.part.std ? 'std' : r.part.proc || 'milling';
    (groups[key] = groups[key] || []).push(r);
    const m = MATERIALS[r.part.mat];
    if (!r.part.std && m?.finishCostM2) (groups.finish = groups.finish || []).push(r);
  }
  return groups;
}
const GROUP_NAME = { ...Object.fromEntries(Object.entries(PROCESSES).map(([k, v]) => [k, v.name])), finish: '표면처리', std: '구매품' };

function tabOutsource(el, p, ctx, save) {
  const built = buildProject(p);
  const set = drawingSet(built, meta(p));
  const dwgNo = new Map(set.filter((d) => d.pn).map((d) => [d.pn, d.dwgNo]));
  const groups = outsourceGroups(built);
  const V = db.data.vendors;
  p.rfqs = p.rfqs || [];
  const due = addDays(today(), 10);
  const spent = p.rfqs.filter((r) => ['발주', '입고'].includes(r.status)).reduce((s, r) => s + (+r.amount || 0), 0);
  el.innerHTML = `<p class="muted">가공 공정·재질별로 부품을 묶고, 외주처 DB에서 공정·재질·평점·납기로 적합한 업체를 추천합니다. 견적요청(RFQ) → 견적 접수 → 발주 → 입고 순으로 관리됩니다.</p>
  ${Object.entries(groups).map(([g, rows]) => { const ranked = matchVendors(V, g, rows.map((r) => r.part.mat)); return `<div class="card" style="margin-bottom:12px">
    <div class="row between"><h4 style="margin:0">${esc(GROUP_NAME[g] || g)} <span class="muted">${rows.length}품목</span></h4>
    <div class="row"><select data-v="${g}" aria-label="외주처">${ranked.map((x) => `<option value="${x.v.id}">${esc(x.v.name)} — 적합도 ${x.score.toFixed(0)}${x.missing.length ? ` (재질 미보유: ${x.missing.join(',')})` : ''}</option>`).join('') || '<option value="">적합한 외주처 없음 — 외주처 메뉴에서 등록</option>'}</select>
    <input type="date" data-due="${g}" value="${due}" style="width:auto" aria-label="희망 납기"><button class="btn sm" data-rfq="${g}" ${ranked.length ? '' : 'disabled'}>견적 요청 생성</button></div></div>
    <table class="tbl" style="margin-top:8px"><tr><th>도번</th><th>품명</th><th>재질/규격</th><th>치수</th><th class="r">수량</th></tr>${rows.map((r) => `<tr><td>${esc(dwgNo.get(r.pn) || '-')}</td><td>${esc(r.name)}</td><td>${esc(r.matText)}</td><td>${esc(r.sizeText || '')}</td><td class="r">${r.qty * (p.qty || 1)}</td></tr>`).join('')}</table></div>`; }).join('')}
  <div class="card scroll-x"><div class="row between"><h4 style="margin:0">견적요청 · 발주 현황</h4><span class="muted">발주 합계 ${won(spent)}${p.quoteSnapshot ? ` · 확정 견적 대비 ${((spent / p.quoteSnapshot.total) * 100).toFixed(1)}%` : ''}</span></div>
  <table class="tbl"><tr><th>RFQ</th><th>외주처</th><th>구분</th><th>품목</th><th>납기</th><th>상태</th><th class="r">견적금액(원)</th><th></th></tr>
  ${p.rfqs.map((r, i) => { const v = V.find((x) => x.id === r.vendorId) || { name: '(삭제된 업체)' }; return `<tr><td>${esc(r.no)}<div class="muted">${esc(r.at)}</div></td><td>${esc(v.name)}</td><td>${esc(GROUP_NAME[r.group] || r.group)}</td><td>${r.items.length}품목</td><td>${esc(r.due)}</td>
    <td><select data-st="${i}" style="width:auto">${['요청', '견적수신', '발주', '입고', '취소'].map((s) => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
    <td class="r"><input type="number" data-amt="${i}" value="${r.amount || ''}" style="width:120px;text-align:right"></td>
    <td class="row"><button class="link" data-mail="${i}">메일</button><button class="link" data-doc="${i}">요청서</button><button class="link" data-po="${i}">발주서</button><button class="link" data-x="${i}">삭제</button></td></tr>`; }).join('') || '<tr><td colspan="8" class="muted">견적 요청 내역이 없습니다.</td></tr>'}</table>
  <p class="muted">도면 첨부: ④ 2D 도면 탭의 "전체 도면 ZIP"을 내려받아 메일에 첨부하세요.</p></div>`;

  el.querySelectorAll('[data-rfq]').forEach((b) => b.onclick = () => {
    const g = b.dataset.rfq, vid = el.querySelector(`[data-v="${g}"]`).value;
    const items = groups[g].map((r) => ({ pn: r.pn, name: r.name, mat: r.matText, size: r.sizeText || '', qty: r.qty * (p.qty || 1), dwgNo: dwgNo.get(r.pn) || '' }));
    p.rfqs.push({ id: uid('r'), no: `${p.no}-R${String(p.rfqs.length + 1).padStart(2, '0')}`, vendorId: vid, group: g, items, due: el.querySelector(`[data-due="${g}"]`).value, status: '요청', at: today(), amount: '' });
    if (['상담', '견적', '설계'].includes(p.status)) p.status = '발주';
    save(); ctx.route();
  });
  el.querySelectorAll('[data-st]').forEach((s) => s.onchange = () => { const r = p.rfqs[+s.dataset.st]; r.status = s.value; if (s.value === '발주' && !r.poNo) { r.poNo = r.no.replace('-R', '-PO'); r.poAt = today(); } if (p.rfqs.every((x) => ['입고', '취소'].includes(x.status)) && p.status === '발주') p.status = '제작'; save(); ctx.route(); });
  el.querySelectorAll('[data-amt]').forEach((s) => s.onchange = () => { p.rfqs[+s.dataset.amt].amount = +s.value || ''; save(); ctx.route(); });
  el.querySelectorAll('[data-x]').forEach((s) => s.onclick = () => { if (confirm('삭제할까요?')) { p.rfqs.splice(+s.dataset.x, 1); save(); ctx.route(); } });
  const vOf = (r) => V.find((x) => x.id === r.vendorId) || {};
  const itemTable = (r, price) => `<table><tr><th>No</th><th>도번</th><th>품명</th><th>재질/규격</th><th>치수</th><th class="c">수량</th>${price ? '<th class="r">금액</th>' : ''}</tr>${r.items.map((it, k) => `<tr><td>${k + 1}</td><td>${esc(it.dwgNo)}</td><td>${esc(it.name)}</td><td>${esc(it.mat)}</td><td>${esc(it.size)}</td><td class="c">${it.qty}</td>${price ? '<td></td>' : ''}</tr>`).join('')}</table>`;
  el.querySelectorAll('[data-mail]').forEach((b) => b.onclick = () => {
    const r = p.rfqs[+b.dataset.mail], v = vOf(r);
    const body = `${v.name} ${v.contact || ''}님 안녕하세요.\n${CONFIG.companyKo} ${db.data.settings.designer}입니다.\n\n아래 품목 견적 부탁드립니다. (도면 첨부)\n\n${r.items.map((it, k) => `${k + 1}. [${it.dwgNo}] ${it.name} / ${it.mat} / ${it.size} / ${it.qty}EA`).join('\n')}\n\n- 희망 납기: ${r.due}\n- 회신 요청: 품목별 단가, 총액, 납기, 견적 유효기간\n\n감사합니다.\n${CONFIG.phone} / ${CONFIG.email}`;
    location.href = `mailto:${v.email || ''}?subject=${encodeURIComponent(`[견적요청] ${r.no} ${p.title} - ${GROUP_NAME[r.group] || ''}`)}&body=${encodeURIComponent(body)}`;
  });
  el.querySelectorAll('[data-doc]').forEach((b) => b.onclick = () => { const r = p.rfqs[+b.dataset.doc], v = vOf(r); printDoc(`견적요청서_${r.no}`, `<h1>견 적 요 청 서</h1><table><tr><th>요청번호</th><td>${esc(r.no)}</td><th>요청일</th><td>${esc(r.at)}</td></tr><tr><th>수신</th><td>${esc(v.name || '')} ${esc(v.contact || '')} 귀하</td><th>발신</th><td>${esc(CONFIG.companyKo)} ${esc(db.data.settings.designer)}<br>${esc(CONFIG.phone)}</td></tr><tr><th>건명</th><td>${esc(p.title)} — ${esc(GROUP_NAME[r.group] || '')}</td><th>희망 납기</th><td>${esc(r.due)}</td></tr></table>${itemTable(r, true)}<p class="muted">· 첨부 도면에 따라 견적 바랍니다. 일반공차 KS B ISO 2768-m · 표면처리 도면 주기 참조<br>· 회신: 품목별 단가, 총액(VAT 별도), 납기, 견적 유효기간</p>`); });
  el.querySelectorAll('[data-po]').forEach((b) => b.onclick = () => { const r = p.rfqs[+b.dataset.po], v = vOf(r); if (!r.amount) return toast('견적 금액을 먼저 입력하세요.'); printDoc(`발주서_${r.poNo || r.no}`, `<h1>발 주 서</h1><table><tr><th>발주번호</th><td>${esc(r.poNo || r.no.replace('-R', '-PO'))}</td><th>발주일</th><td>${esc(r.poAt || today())}</td></tr><tr><th>공급자</th><td>${esc(v.name || '')} (${esc(v.phone || '')})</td><th>발주자</th><td>${esc(CONFIG.companyKo)} ${esc(CONFIG.bizNo)}<br>${esc(CONFIG.phone)}</td></tr><tr><th>건명</th><td>${esc(p.title)}</td><th>납기</th><td>${esc(r.due)}</td></tr><tr><th>발주금액</th><td colspan="3"><b>${won(r.amount)}</b> (VAT 별도) / VAT 포함 ${won(r.amount * 1.1)}</td></tr></table>${itemTable(r, false)}<p class="muted">· 납품장소: 발주자 지정 장소 · 검수: 도면 치수·표면처리 확인 후 인수 · 대금: 검수 후 익월 말 현금 지급<br>· 도면과 상이한 경우 반품 및 재제작 요청할 수 있습니다.</p><div class="sign"><div>담당</div><div>검토</div><div>승인</div></div>`); });
}

// ---------------- ⑥ 일정 ----------------
function tabSchedule(el, p, ctx, save) {
  el.innerHTML = `<div class="row" style="margin-bottom:12px"><label class="field" style="margin:0"><span>착수일</span><input type="date" id="st" value="${esc(p.schedule?.[0]?.start || today())}"></label>
    <button class="btn sm" id="gen" style="margin-top:18px">${p.schedule?.length ? '↻ 일정 재생성' : '⚡ 표준 일정 자동 생성'}</button>
    ${p.dueDate ? `<span class="badge blue" style="margin-top:18px">납품 예정 ${esc(p.dueDate)}</span>` : ''}${p.request?.deadline ? `<span class="badge ${p.dueDate && p.dueDate > p.request.deadline ? 'bad' : 'ok'}" style="margin-top:18px">고객 희망 ${esc(p.request.deadline)}</span>` : ''}</div>
  ${p.schedule?.length ? `<div class="card scroll-x"><table class="tbl"><tr><th>작업</th><th>시작</th><th>종료</th><th>완료</th></tr>${p.schedule.map((s, i) => `<tr><td>${esc(s.name)}</td><td><input type="date" data-s="${i}" value="${s.start}"></td><td><input type="date" data-e="${i}" value="${s.end}"></td><td><input type="checkbox" data-d="${i}" ${s.done ? 'checked' : ''} aria-label="완료"></td></tr>`).join('')}</table></div>
  <div class="gantt" style="margin-top:16px">${ganttSVG(scheduleRows([p]))}</div>` : '<p class="muted">일정이 없습니다. 자동 생성하면 설계 난이도·외주 납기 기준 표준 일정이 만들어집니다.</p>'}`;
  $('#gen').onclick = () => { p.schedule = generateSchedule(p, $('#st').value || today(), db.data.vendors); p.dueDate = p.schedule.at(-1).end; save(); ctx.route(); };
  const upd = () => { p.dueDate = p.schedule.reduce((m, s) => (s.end > m ? s.end : m), ''); save(); ctx.route(); };
  el.querySelectorAll('[data-s]').forEach((i) => i.onchange = () => { p.schedule[+i.dataset.s].start = i.value; upd(); });
  el.querySelectorAll('[data-e]').forEach((i) => i.onchange = () => { p.schedule[+i.dataset.e].end = i.value; upd(); });
  el.querySelectorAll('[data-d]').forEach((i) => i.onchange = () => { p.schedule[+i.dataset.d].done = i.checked; upd(); });
}
