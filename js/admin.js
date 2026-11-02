// =============================================================
//  관리자 페이지 — 라우터, 로그인, 대시보드, 의뢰함, 프로젝트 목록, 설정
// =============================================================
import { CONFIG } from './config.js?v=20261102';
import { db, remote } from './store.js';
import { $, $$, esc, toast, sha256, download, today, uid, daysBetween } from './util.js';
import { analyze } from './analyzer.js';
import { renderProject } from './admin-project.js';
import { renderVendors, renderSchedule, renderAI, ganttSVG, scheduleRows } from './admin-ops.js';
import { manwon } from './estimator.js';

db.load();
const main = $('#main');
export const cleanups = [];
function runCleanups() { while (cleanups.length) { try { cleanups.pop()(); } catch { /* ignore */ } } }

export const STATUSES = ['상담', '견적', '설계', '발주', '제작', '납품', '완료', '보류'];
export const statusBadge = (s) => `<span class="badge ${{ 상담: '', 견적: 'blue', 설계: 'blue', 발주: 'warn', 제작: 'warn', 납품: 'ok', 완료: 'ok', 보류: 'bad' }[s] || ''}">${esc(s)}</span>`;

// ---------------- 로그인 ----------------
// 예전 화면이 캐시로 남아 아이디 칸이 없으면 자동으로 추가
if (!$('#uid')) {
  const pwField = $('#pw').closest('.field');
  pwField.insertAdjacentHTML('beforebegin', '<label class="field"><span>아이디</span><input id="uid" autocomplete="username" required></label>');
  $('#uid').focus();
}
async function tryLogin(id, pw) { return (await sha256(`${id.trim()}:${pw}`)) === CONFIG.adminLoginSha256; }
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (await tryLogin($('#uid').value, $('#pw').value)) { sessionStorage.setItem('mk_admin', '1'); enter(); }
  else { $('#loginMsg').textContent = '아이디 또는 비밀번호가 올바르지 않습니다.'; $('#pw').select(); }
});
$('#logout').addEventListener('click', (e) => { e.preventDefault(); sessionStorage.removeItem('mk_admin'); location.reload(); });
function enter() {
  $('#login').classList.add('hidden');
  route();
}
if (sessionStorage.getItem('mk_admin') === '1') enter();

// ---------------- 라우터 ----------------
window.addEventListener('hashchange', route);
export function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
export function route() {
  if (sessionStorage.getItem('mk_admin') !== '1') return;
  runCleanups();
  const [, view = 'dashboard', id, tab] = (location.hash || '#/dashboard').split('/');
  $$('#side a').forEach((a) => a.classList.toggle('on', a.dataset.nav === view || (view === 'project' && a.dataset.nav === 'projects')));
  const n = db.data.requests.filter((r) => r.status === '신규').length;
  $('#reqCnt').textContent = n; $('#reqCnt').classList.toggle('hidden', !n);
  main.innerHTML = '';
  const ctx = { main, cleanups, go, route, save: () => db.save(), statusBadge, STATUSES };
  ({
    dashboard: renderDashboard, requests: renderRequests, projects: renderProjects,
    project: () => { const p = db.data.projects.find((x) => x.id === id); if (!p) return go('#/projects'); renderProject(main, p, tab || 'analysis', ctx); },
    vendors: () => renderVendors(main, ctx), schedule: () => renderSchedule(main, ctx), ai: () => renderAI(main, ctx, id), settings: renderSettings,
  }[view] || renderDashboard)();
  window.scrollTo(0, 0);
}

// ---------------- 프로젝트 생성 ----------------
export function createProject({ title, customer = {}, request = {}, design, fromRequest }) {
  const a = analyze(`${request.title || ''}\n${request.text || ''}`, request.chosenType || undefined);
  const p = {
    id: uid('p'), no: db.nextNo(), title: title || request.title || a.typeName, status: '상담', createdAt: today(),
    customer, request, fromRequest: fromRequest || '',
    design: design?.type ? { ...design } : { type: a.type, params: a.params },
    analysis: { typeName: a.typeName, confidence: a.confidence, suggestions: a.suggestions, questions: a.questions.map((q) => q.q), evidence: a.evidence },
    revisions: [], tier: request.quoteTier || 'mid', qty: request.qty || 1, rfqs: [], schedule: [], notes: '', aiNotes: [], overrides: {}, extraNotes: {},
  };
  db.data.projects.unshift(p); db.save();
  return p;
}

// ---------------- 대시보드 ----------------
function renderDashboard() {
  const P = db.data.projects;
  const active = P.filter((p) => !['완료', '보류'].includes(p.status));
  const t = today();
  const tasks = P.flatMap((p) => (p.schedule || []).filter((s) => !s.done).map((s) => ({ ...s, p })));
  const late = tasks.filter((s) => s.end < t);
  const soon = tasks.filter((s) => s.end >= t && daysBetween(t, s.end) <= 14).sort((a, b) => a.end.localeCompare(b.end));
  const thisMonth = P.filter((p) => p.dueDate && p.dueDate.slice(0, 7) === t.slice(0, 7));
  const pipeline = active.reduce((s, p) => s + (p.quoteSnapshot?.total || 0), 0);
  main.innerHTML = `<h2>대시보드</h2>
  <div class="kpis">
    <div class="kpi"><b>${db.data.requests.filter((r) => r.status === '신규').length}</b><span>신규 의뢰</span></div>
    <div class="kpi"><b>${active.length}</b><span>진행 중 프로젝트</span></div>
    <div class="kpi"><b>${thisMonth.length}</b><span>이번 달 납품 예정</span></div>
    <div class="kpi"><b style="color:${late.length ? 'var(--bad)' : 'inherit'}">${late.length}</b><span>지연 작업</span></div>
  </div>
  <div class="grid2">
    <div class="card"><h4>마감 임박 / 지연 작업</h4>${[...late, ...soon].slice(0, 12).map((s) => `<div class="vrow ${s.end < t ? 'bad' : 'info'}"><b>${esc(s.name)} — <a href="#/project/${s.p.id}/schedule">${esc(s.p.no)} ${esc(s.p.title)}</a></b><span>${s.start} ~ ${s.end} ${s.end < t ? `(${daysBetween(s.end, t)}일 지연)` : `(D-${daysBetween(t, s.end)})`}</span></div>`).join('') || '<p class="muted">예정된 작업이 없습니다.</p>'}</div>
    <div class="card"><h4>진행 프로젝트 <span class="muted">· 확정 견적 합계 ${manwon(pipeline)}</span></h4>
      <table class="tbl"><tr><th>번호</th><th>프로젝트</th><th>상태</th><th>납기</th></tr>
      ${active.slice(0, 10).map((p) => `<tr><td>${esc(p.no)}</td><td><a href="#/project/${p.id}">${esc(p.title)}</a><div class="muted">${esc(p.customer?.company || p.customer?.name || '')}</div></td><td>${statusBadge(p.status)}</td><td>${esc(p.dueDate || '-')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">없음</td></tr>'}</table></div>
  </div>
  <div class="card" style="margin-top:16px"><h4>전체 일정</h4><div class="gantt">${ganttSVG(scheduleRows(active))}</div></div>`;
}

// ---------------- 의뢰함 ----------------
function renderRequests() {
  const R = db.data.requests;
  main.innerHTML = `<div class="row between"><h2>의뢰함</h2>
    <div class="row"><button class="btn sm" id="pull">☁ 서버에서 새 의뢰 가져오기</button>
    <label class="btn ghost sm">📄 의뢰서 JSON 불러오기<input type="file" id="imp" accept=".json" hidden multiple></label></div></div>
    <p class="muted">고객 페이지에서 접수된 의뢰는 Google Apps Script(구글 시트)에 저장됩니다. 이메일로 받은 의뢰서(.json)는 직접 불러올 수 있습니다.</p>
    <div class="card scroll-x"><table class="tbl"><tr><th>접수번호</th><th>접수일</th><th>의뢰인</th><th>내용</th><th>희망 견적</th><th>상태</th><th></th></tr>
    ${R.map((r) => { const d = r.payload || {}; return `<tr><td>${esc(r.id)}</td><td>${esc((r.receivedAt || '').slice(0, 10))}</td>
      <td>${esc(d.customer?.name || '')}<div class="muted">${esc(d.customer?.company || '')}<br>${esc(d.customer?.phone || '')} · ${esc(d.customer?.email || '')}</div></td>
      <td><b>${esc(d.request?.title || '')}</b>${d.ref ? ` <span class="badge blue">수정요청: ${esc(d.ref)}</span>` : ''}<div class="muted" style="max-width:420px">${esc((d.request?.text || '').slice(0, 160))}</div>
      ${(r.files || []).map((f) => `<a href="${esc(f.url || '#')}" target="_blank" rel="noopener" class="muted">📎${esc(f.name)}</a>`).join(' ')}</td>
      <td>${d.quote ? `${{ low: '저가', mid: '표준', high: '고가' }[d.quote.tier] || ''} ${manwon(d.quote.selected || 0)}` : '-'}</td>
      <td>${statusBadge(r.status === '신규' ? '상담' : r.status === '전환됨' ? '설계' : '보류').replace(/>(.*)</, `>${esc(r.status)}<`)}</td>
      <td class="row"><button class="btn sm" data-conv="${esc(r.id)}" ${r.status === '전환됨' ? 'disabled' : ''}>프로젝트로 전환</button>
      <button class="btn ghost sm" data-hold="${esc(r.id)}">보류</button><button class="link" data-del="${esc(r.id)}">삭제</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">의뢰가 없습니다.</td></tr>'}</table></div>`;
  $('#pull').onclick = async () => {
    try {
      const res = await remote.list();
      let n = 0;
      for (const row of res.rows || []) {
        if (R.some((r) => r.id === row.id)) continue;
        R.unshift({ id: row.id, receivedAt: row.receivedAt, status: '신규', payload: row.data, files: row.files || [] }); n++;
      }
      db.save(); toast(`새 의뢰 ${n}건을 가져왔습니다.`); route();
    } catch (err) { toast('가져오기 실패: ' + err.message, 5000); }
  };
  $('#imp').onchange = async (e) => {
    for (const f of e.target.files) {
      try { const d = JSON.parse(await f.text()); const id = d.id || 'REQ-' + uid(); if (!R.some((r) => r.id === id)) R.unshift({ id, receivedAt: d.submittedAt || new Date().toISOString(), status: '신규', payload: d, files: [] }); }
      catch (err) { toast(`${f.name}: ${err.message}`); }
    }
    db.save(); route();
  };
  main.querySelectorAll('[data-conv]').forEach((b) => b.onclick = () => {
    const r = R.find((x) => x.id === b.dataset.conv), d = r.payload || {};
    const existing = d.ref && db.data.projects.find((p) => p.no === d.ref);
    if (existing && confirm(`기존 프로젝트 ${existing.no}의 수정 요청입니다. 고객이 조정한 설계안을 새 리비전으로 반영할까요?`)) {
      existing.revisions.push({ at: new Date().toISOString(), note: '고객 수정 요청 반영 전', design: existing.design });
      if (d.design) existing.design = d.design;
      existing.notes += `\n[${today()} 고객 수정요청] ${d.request?.etc || ''}`;
      r.status = '전환됨'; db.save(); return go(`#/project/${existing.id}/design`);
    }
    const p = createProject({ title: d.request?.title, customer: d.customer || {}, request: { ...d.request, files: r.files, quoteTier: d.quote?.tier }, design: d.design, fromRequest: r.id });
    r.status = '전환됨'; db.save();
    remote.hasEndpoint() && remote.update(r.id, { status: '전환됨', project: p.no }).catch(() => {});
    go(`#/project/${p.id}`);
  });
  main.querySelectorAll('[data-hold]').forEach((b) => b.onclick = () => { R.find((x) => x.id === b.dataset.hold).status = '보류'; db.save(); route(); });
  main.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { if (confirm('이 의뢰를 목록에서 삭제할까요? (구글 시트 원본은 유지)')) { db.data.requests = R.filter((x) => x.id !== b.dataset.del); db.save(); route(); } });
}

// ---------------- 프로젝트 목록 ----------------
function renderProjects() {
  const P = db.data.projects;
  main.innerHTML = `<div class="row between"><h2>프로젝트</h2><button class="btn sm" id="newBtn">＋ 새 프로젝트</button></div>
  <form class="card hidden" id="newForm" style="margin-bottom:16px">
    <div class="grid2"><label class="field"><span>제품명</span><input name="title" required></label>
    <label class="field"><span>고객(회사/성함)</span><input name="cust"></label>
    <label class="field"><span>연락처</span><input name="phone"></label><label class="field"><span>이메일</span><input name="email" type="email"></label></div>
    <label class="field"><span>요구사항 (전화·미팅 메모 그대로)</span><textarea name="text" rows="4"></textarea></label>
    <button class="btn">생성 후 분석</button></form>
  <div class="card scroll-x"><table class="tbl"><tr><th>번호</th><th>프로젝트</th><th>고객</th><th>상태</th><th class="r">확정 견적</th><th>납기</th><th>등록</th></tr>
  ${P.map((p) => `<tr><td>${esc(p.no)}</td><td><a href="#/project/${p.id}">${esc(p.title)}</a></td><td>${esc(p.customer?.company || '')} ${esc(p.customer?.name || '')}</td>
    <td>${statusBadge(p.status)}</td><td class="r">${p.quoteSnapshot ? manwon(p.quoteSnapshot.total) : '-'}</td><td>${esc(p.dueDate || '-')}</td><td>${esc(p.createdAt)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">프로젝트가 없습니다. 의뢰함에서 전환하거나 새로 만드세요.</td></tr>'}</table></div>`;
  $('#newBtn').onclick = () => $('#newForm').classList.toggle('hidden');
  $('#newForm').onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    const p = createProject({ title: f.title, customer: { name: f.cust, phone: f.phone, email: f.email }, request: { title: f.title, text: f.text, qty: 1 } });
    go(`#/project/${p.id}`);
  };
}

// ---------------- 설정 ----------------
function renderSettings() {
  const s = db.data.settings, r = s.rates || {};
  main.innerHTML = `<h2>설정</h2>
  <div class="grid2">
    <form class="card" id="setForm">
      <h4>기본 정보 · 서버 연결</h4>
      <label class="field"><span>설계 담당자명 (도면 표제란)</span><input name="designer" value="${esc(s.designer || '')}"></label>
      <label class="field"><span>Apps Script 웹앱 URL</span><input name="appsScriptUrl" value="${esc(s.appsScriptUrl || '')}" placeholder="https://script.google.com/macros/s/.../exec"></label>
      <label class="field"><span>관리자 토큰 (Apps Script 스크립트 속성 ADMIN_TOKEN 과 동일)</span><input name="adminToken" type="password" value="${esc(s.adminToken || '')}"></label>
      <h4 style="margin-top:16px">견적 단가</h4>
      <div class="grid2">
        <label class="field"><span>설계 시간당 단가(원)</span><input name="designRate" type="number" value="${r.designRate ?? 60000}"></label>
        <label class="field"><span>조립 시간당 단가(원)</span><input name="assemblyRate" type="number" value="${r.assemblyRate ?? 50000}"></label>
        <label class="field"><span>일반관리비+이윤 (0.15 = 15%)</span><input name="overhead" type="number" step="0.01" value="${r.overhead ?? 0.15}"></label>
        <label class="field"><span>전체 보정 계수 (시세 반영)</span><input name="priceFactor" type="number" step="0.05" value="${r.priceFactor ?? 1}"></label>
      </div>
      <div class="row"><button class="btn">저장</button><button type="button" class="btn ghost" id="ping">연결 테스트</button></div>
    </form>
    <div>
      <div class="card"><h4>관리자 아이디 · 비밀번호 변경</h4>
        <p class="muted">새 아이디·비밀번호로 로그인 해시를 만든 뒤 <code>js/config.js</code>의 <code>adminLoginSha256</code> 값을 교체하고 GitHub에 커밋하세요. (Claude에게 "관리자 비밀번호 바꿔줘"라고 해도 됩니다)</p>
        <div class="row"><input id="newid" placeholder="새 아이디" autocomplete="off" style="flex:1"><input type="password" id="newpw" placeholder="새 비밀번호 (6자 이상)" autocomplete="new-password" style="flex:1"><button class="btn sm" id="hashBtn">로그인 해시 생성</button></div>
        <div class="pre hidden" id="hashOut" style="margin-top:10px"></div></div>
      <div class="card" style="margin-top:16px"><h4>백업 · 복원</h4>
        <p class="muted">모든 관리자 데이터는 이 브라우저(localStorage)에 저장됩니다. 주 1회 백업을 권장합니다.</p>
        <div class="row"><button class="btn sm" id="bk">⬇ 백업 파일 저장</button>
        <label class="btn ghost sm">⬆ 백업 복원<input type="file" id="rs" accept=".json" hidden></label>
        <button class="btn danger sm" id="reset">전체 초기화</button></div></div>
    </div>
  </div>`;
  $('#setForm').onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    Object.assign(s, { designer: f.designer, appsScriptUrl: f.appsScriptUrl.trim(), adminToken: f.adminToken.trim() });
    s.rates = { designRate: +f.designRate, assemblyRate: +f.assemblyRate, overhead: +f.overhead, priceFactor: +f.priceFactor };
    db.save(); toast('저장했습니다.');
  };
  $('#ping').onclick = async () => { try { const r = await remote.ping(); toast(`연결 성공 — 시트 의뢰 ${r.count ?? '?'}건`); } catch (err) { toast('연결 실패: ' + err.message, 5000); } };
  $('#hashBtn').onclick = async () => {
    const id = $('#newid').value.trim(), v = $('#newpw').value;
    if (!id) return toast('아이디를 입력하세요.');
    if (v.length < 6) return toast('비밀번호는 6자 이상 입력하세요.');
    const h = await sha256(`${id}:${v}`); const o = $('#hashOut'); o.classList.remove('hidden');
    o.textContent = `adminLoginSha256: '${h}',`;
  };
  $('#bk').onclick = () => download(`mk_admin_backup_${today()}.json`, db.exportJSON(), 'application/json');
  $('#rs').onchange = async (e) => { try { db.importJSON(await e.target.files[0].text()); toast('복원했습니다.'); route(); } catch (err) { toast('복원 실패: ' + err.message); } };
  $('#reset').onclick = () => { if (prompt('전체 데이터를 삭제합니다. "삭제"를 입력하세요.') === '삭제') { localStorage.removeItem('mk_mecha_admin_db_v1'); db.load(); route(); } };
}

