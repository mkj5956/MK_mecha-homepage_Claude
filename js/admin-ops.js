// =============================================================
//  관리자 — 외주처 관리, 일정(간트), AI 도우미
// =============================================================
import { CONFIG } from './config.js';
import { db } from './store.js';
import { $, esc, toast, today, addDays, daysBetween, uid, copyText, extractJSON } from './util.js';
import { MATERIALS, PROCESSES } from './kb.js';
import { getTemplate, TEMPLATES, buildDesign } from './templates.js';
import { estimate } from './estimator.js';
import { buildPrompt, PROMPT_KINDS, bomText, validateParts } from './prompts.js';
import { buildProject, quoteText } from './admin-project.js';
import { shareUrl } from './share.js';

// ---------------- 외주처 매칭 ----------------
export function matchVendors(vendors, group, mats) {
  const need = [...new Set(mats.filter(Boolean))];
  return vendors.filter((v) => (v.processes || []).includes(group)).map((v) => {
    const missing = group === 'std' ? [] : need.filter((m) => !(v.materials || []).includes(m));
    const score = (v.rating || 3) * 15 - (v.leadDays || 10) * 1.5 - missing.length * 12 + 20;
    return { v, score, missing };
  }).sort((a, b) => b.score - a.score);
}

// ---------------- 일정 ----------------
export function generateSchedule(p, start, vendors) {
  const t = getTemplate(p.design.type), dh = t.designHours;
  const lead = Math.max(7, ...(p.rfqs || []).map((r) => vendors.find((v) => v.id === r.vendorId)?.leadDays || 0), ...vendors.filter((v) => !v.processes?.includes('std')).map((v) => v.leadDays || 0).slice(0, 2));
  const plan = [
    ['order', '수주·계약', 1], ['concept', '컨셉 설계·고객 확인', Math.ceil((dh * 0.4) / 8) + 2], ['detail', '상세 설계·2D 도면', Math.ceil((dh * 0.6) / 8) + 1],
    ['rfq', '외주 견적·발주', 3], ['mfg', '부품 가공 (외주)', lead], ['buy', '구매품 입고', 7, 'mfg'], ['finish', '표면처리', 3],
    ['asm', '조립·배선', t.automated ? 5 : 2], ['test', '시운전·검사', t.automated ? 3 : 1], ['deliver', '납품·설치', 1],
  ];
  const out = []; let cur = start;
  for (const [key, name, days, parallel] of plan) {
    if (parallel) { const ref = out.find((x) => x.key === parallel); out.push({ key, name, start: ref.start, end: addDays(ref.start, days - 1), done: false }); continue; }
    out.push({ key, name, start: cur, end: addDays(cur, days - 1), done: false });
    cur = addDays(cur, days);
  }
  return out;
}
export function scheduleRows(projects) {
  return projects.flatMap((p) => (p.schedule || []).map((s) => ({ ...s, label: s.name, group: `${p.no} ${p.title}`, pid: p.id })));
}
export function ganttSVG(rows) {
  if (!rows.length) return '<p class="muted" style="padding:16px">표시할 일정이 없습니다. 프로젝트의 ⑥ 일정 탭에서 생성하세요.</p>';
  const t = today();
  let min = rows.reduce((m, r) => (r.start < m ? r.start : m), rows[0].start);
  let max = rows.reduce((m, r) => (r.end > m ? r.end : m), rows[0].end);
  if (t < min) min = t; if (t > max) max = t;
  min = addDays(min, -2); max = addDays(max, 3);
  const days = daysBetween(min, max) + 1, dw = days > 120 ? 8 : 18, lw = 230, rh = 24, top = 38;
  const groups = []; rows.forEach((r) => { if (!groups.length || groups.at(-1).g !== r.group) groups.push({ g: r.group, pid: r.pid, rows: [] }); groups.at(-1).rows.push(r); });
  const H = top + rows.length * rh + groups.length * rh + 10, W = lw + days * dw + 10;
  const o = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-size="12" role="img" aria-label="간트 차트">`];
  for (let i = 0; i < days; i++) {
    const d = addDays(min, i), dt = new Date(d + 'T00:00:00'), x = lw + i * dw, wk = dt.getDay() === 0 || dt.getDay() === 6;
    if (wk) o.push(`<rect x="${x}" y="${top - 4}" width="${dw}" height="${H - top}" fill="var(--surface2)"/>`);
    if (dt.getDate() === 1 || i === 0) o.push(`<text x="${x + 2}" y="13" fill="var(--text)" font-weight="700">${dt.getMonth() + 1}월</text>`);
    if (dw >= 14 || dt.getDay() === 1) o.push(`<text x="${x + dw / 2}" y="29" text-anchor="middle" fill="var(--muted)" font-size="10">${dt.getDate()}</text>`);
  }
  let y = top;
  for (const g of groups) {
    o.push(`<rect x="0" y="${y}" width="${W}" height="${rh}" fill="var(--accent-soft)"/><a href="#/project/${g.pid}/schedule"><text x="8" y="${y + 16}" font-weight="700" fill="var(--accent)">${esc(g.g.slice(0, 34))}</text></a>`);
    y += rh;
    for (const r of g.rows) {
      const x1 = lw + daysBetween(min, r.start) * dw, x2 = lw + (daysBetween(min, r.end) + 1) * dw;
      const late = !r.done && r.end < t, prog = !r.done && r.start <= t && r.end >= t;
      const fill = r.done ? 'var(--ok)' : late ? 'var(--bad)' : prog ? 'var(--accent)' : 'var(--blue)';
      o.push(`<text x="16" y="${y + 16}" fill="var(--text)">${esc(r.label)}</text><rect x="${x1}" y="${y + 5}" width="${Math.max(4, x2 - x1)}" height="${rh - 10}" rx="3" fill="${fill}" opacity="${r.done ? 0.6 : 0.9}"><title>${esc(r.label)} ${r.start} ~ ${r.end}</title></rect>`);
      y += rh;
    }
  }
  const tx = lw + (daysBetween(min, t) + 0.5) * dw;
  o.push(`<line x1="${tx}" y1="${top - 6}" x2="${tx}" y2="${H}" stroke="var(--bad)" stroke-width="1.5" stroke-dasharray="4 3"/><text x="${tx + 3}" y="${top - 8}" fill="var(--bad)" font-size="10">오늘</text></svg>`);
  return o.join('');
}
export function renderSchedule(main) {
  const P = db.data.projects.filter((p) => p.status !== '보류');
  main.innerHTML = `<h2>일정 관리</h2><p class="muted">수주 → 설계 → 발주 → 제작 → 납품 전체 일정. 막대 색: <span style="color:var(--blue)">■ 예정</span> <span style="color:var(--accent)">■ 진행</span> <span style="color:var(--bad)">■ 지연</span> <span style="color:var(--ok)">■ 완료</span></p>
  <div class="gantt">${ganttSVG(scheduleRows(P))}</div>`;
}

// ---------------- 외주처 관리 ----------------
export function renderVendors(main, ctx) {
  const V = db.data.vendors;
  const procKeys = [...Object.keys(PROCESSES).filter((k) => k !== 'std'), 'finish', 'std'];
  const pname = (k) => (k === 'finish' ? '표면처리' : k === 'std' ? '구매품' : PROCESSES[k].name);
  main.innerHTML = `<div class="row between"><h2>외주처 관리</h2><button class="btn sm" id="add">＋ 외주처 등록</button></div>
  <p class="muted">공정·보유 재질·평점·평균 납기를 입력하면 도면별 외주처가 자동 추천됩니다. (예시 업체는 실제 거래처로 교체하세요)</p>
  <form class="card hidden" id="vf" style="margin-bottom:16px"><input type="hidden" name="id">
    <div class="grid3"><label class="field"><span>업체명 *</span><input name="name" required></label><label class="field"><span>담당자</span><input name="contact"></label><label class="field"><span>지역</span><input name="region"></label>
    <label class="field"><span>이메일</span><input name="email" type="email"></label><label class="field"><span>전화</span><input name="phone"></label><label class="field"><span>평균 납기(일)</span><input name="leadDays" type="number" min="1" value="7"></label>
    <label class="field"><span>평점 (1~5)</span><input name="rating" type="number" min="1" max="5" step="0.1" value="4"></label></div>
    <div class="field"><span>가공 공정</span><div class="row">${procKeys.map((k) => `<label class="chk"><input type="checkbox" name="proc" value="${k}"> ${pname(k)}</label>`).join('')}</div></div>
    <div class="field"><span>보유/가공 가능 재질</span><div class="row">${Object.entries(MATERIALS).map(([k, m]) => `<label class="chk"><input type="checkbox" name="mat" value="${k}"> ${m.name}</label>`).join('')}</div></div>
    <label class="field"><span>메모</span><input name="notes"></label><div class="row"><button class="btn">저장</button><button type="button" class="btn ghost" id="cancel">취소</button></div></form>
  <div class="card scroll-x"><table class="tbl"><tr><th>업체</th><th>공정</th><th>재질</th><th>평점</th><th>납기</th><th>연락처</th><th></th></tr>
  ${V.map((v) => `<tr><td><b>${esc(v.name)}</b><div class="muted">${esc(v.region || '')} ${esc(v.notes || '')}</div></td><td>${(v.processes || []).map((k) => `<span class="badge">${esc(pname(k))}</span>`).join(' ')}</td>
    <td class="muted">${(v.materials || []).map((m) => MATERIALS[m]?.name || m).join(', ')}</td><td>⭐ ${v.rating}</td><td>${v.leadDays}일</td><td class="muted">${esc(v.contact || '')}<br>${esc(v.phone || '')}<br>${esc(v.email || '')}</td>
    <td><button class="link" data-ed="${v.id}">수정</button><button class="link" data-del="${v.id}">삭제</button></td></tr>`).join('')}</table></div>`;
  const f = $('#vf');
  const open = (v = {}) => {
    f.classList.remove('hidden'); f.reset();
    for (const k of ['id', 'name', 'contact', 'region', 'email', 'phone', 'leadDays', 'rating', 'notes']) if (v[k] !== undefined) f.elements[k].value = v[k];
    f.querySelectorAll('[name=proc]').forEach((c) => { c.checked = (v.processes || []).includes(c.value); });
    f.querySelectorAll('[name=mat]').forEach((c) => { c.checked = (v.materials || []).includes(c.value); });
    f.scrollIntoView({ behavior: 'smooth' });
  };
  $('#add').onclick = () => open();
  $('#cancel').onclick = () => f.classList.add('hidden');
  f.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const v = { id: fd.get('id') || uid('v'), name: fd.get('name'), contact: fd.get('contact'), region: fd.get('region'), email: fd.get('email'), phone: fd.get('phone'), leadDays: +fd.get('leadDays') || 7, rating: +fd.get('rating') || 3, notes: fd.get('notes'), processes: fd.getAll('proc'), materials: fd.getAll('mat') };
    const i = V.findIndex((x) => x.id === v.id); if (i >= 0) V[i] = v; else V.push(v);
    db.save(); ctx.route();
  };
  main.querySelectorAll('[data-ed]').forEach((b) => b.onclick = () => open(V.find((v) => v.id === b.dataset.ed)));
  main.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { if (confirm('삭제할까요?')) { db.data.vendors = V.filter((v) => v.id !== b.dataset.del); db.save(); ctx.route(); } });
}

// ---------------- AI 도우미 (구독형 채팅 연동, API 미사용) ----------------
export function renderAI(main, ctx, pid) {
  const P = db.data.projects;
  let p = P.find((x) => x.id === pid) || P[0];
  main.innerHTML = `<h2>AI 도우미 <span class="badge">API 없이 · Claude / ChatGPT 구독으로 사용</span></h2>
  <ol class="muted" style="padding-left:20px;margin-top:0">
    <li>프로젝트와 작업 종류를 고르면 설계 데이터가 채워진 프롬프트가 만들어집니다.</li>
    <li><b>복사</b> → Claude.ai 또는 ChatGPT 채팅창에 붙여넣기 (손그림·PDF는 채팅창에 직접 첨부).</li>
    <li>AI 답변 전체를 아래 <b>답변 붙여넣기</b> 칸에 붙여넣고 <b>적용</b> → 3D 설계·도면·메모에 자동 반영됩니다.</li></ol>
  <div class="grid2">
    <div class="card"><div class="grid2"><label class="field"><span>프로젝트</span><select id="pj">${P.map((x) => `<option value="${x.id}" ${x === p ? 'selected' : ''}>${esc(x.no)} ${esc(x.title)}</option>`).join('') || '<option value="">(프로젝트 없음)</option>'}</select></label>
      <label class="field"><span>작업</span><select id="kind">${PROMPT_KINDS.map((k) => `<option value="${k.key}">${k.name}</option>`).join('')}</select></label></div>
      <label class="field"><span>생성된 프롬프트 (수정 가능)</span><textarea id="prompt" rows="16" style="font-family:ui-monospace,Consolas,monospace;font-size:12.5px"></textarea></label>
      <div class="row"><button class="btn sm" id="cp">📋 복사</button><a class="btn ghost sm" href="https://claude.ai/new" target="_blank" rel="noopener">Claude 열기 ↗</a><a class="btn ghost sm" href="https://chatgpt.com/" target="_blank" rel="noopener">ChatGPT 열기 ↗</a></div></div>
    <div class="card"><label class="field"><span>AI 답변 붙여넣기</span><textarea id="answer" rows="16" placeholder="AI 답변 전체를 붙여넣으세요. JSON 코드블록을 자동으로 찾아 적용합니다."></textarea></label>
      <div class="row"><button class="btn sm" id="apply">✔ 적용</button><button class="btn ghost sm" id="memo">메모로만 저장</button></div><div id="applyOut" style="margin-top:10px"></div></div>
  </div>`;
  const gen = async () => {
    const kind = $('#kind').value;
    if (!p) { $('#prompt').value = buildPrompt(kind, null); return; }
    const built = buildProject(p);
    const q = estimate(built, { qty: p.qty || 1, rates: db.data.settings.rates });
    const extra = { quoteText: quoteText(q), bomText: bomText(built), company: CONFIG.companyKo, designer: db.data.settings.designer };
    if (kind === 'vendor') { const r = (p.rfqs || []).at(-1); const v = r && db.data.vendors.find((x) => x.id === r.vendorId); Object.assign(extra, { vendorName: v?.name, due: r?.due, items: r ? r.items.map((it, k) => `${k + 1}. [${it.dwgNo}] ${it.name} / ${it.mat} / ${it.size} / ${it.qty}EA`).join('\n') : extra.bomText }); }
    if (kind === 'reply') extra.shareUrl = await shareUrl({ ...p.design, no: p.no, title: p.title });
    $('#prompt').value = buildPrompt(kind, p, extra);
  };
  $('#pj').onchange = (e) => { p = P.find((x) => x.id === e.target.value); gen(); };
  $('#kind').onchange = gen;
  gen();
  $('#cp').onclick = async () => { await copyText($('#prompt').value); toast('복사했습니다. Claude/ChatGPT 채팅창에 붙여넣으세요.'); };
  $('#memo').onclick = () => { if (!p) return; p.aiNotes = p.aiNotes || []; p.aiNotes.push({ at: new Date().toISOString(), kind: $('#kind').value, text: $('#answer').value }); db.save(); toast('프로젝트 메모(① 분석 탭)에 저장했습니다.'); };
  $('#apply').onclick = () => {
    const out = $('#applyOut');
    if (!p) return toast('프로젝트를 먼저 만드세요.');
    const kind = $('#kind').value;
    try {
      const j = extractJSON($('#answer').value);
      p.aiNotes = p.aiNotes || [];
      if (j.changes) { // 도면 검토 결과
        p.overrides = p.overrides || {}; p.extraNotes = p.extraNotes || {};
        for (const c of j.changes) {
          if (!c.pn) continue;
          p.overrides[c.pn] = { ...(p.overrides[c.pn] || {}), ...(c.mat ? { mat: c.mat } : {}), ...(c.proc ? { proc: c.proc } : {}) };
          if (c.note) p.extraNotes[c.pn] = [...(p.extraNotes[c.pn] || []), c.note];
        }
        p.aiNotes.push({ at: new Date().toISOString(), kind, text: `도면 변경 ${j.changes.length}건 적용` });
        db.save(); out.innerHTML = `<div class="vrow ok"><b>✔ 도면 변경 ${j.changes.length}건 적용</b><a href="#/project/${p.id}/drawing">④ 2D 도면에서 확인 →</a></div>`; return;
      }
      if (!j.type) throw new Error('"type" 항목이 없습니다.');
      let design;
      if (j.type === 'custom') {
        const errs = validateParts(j.parts);
        if (errs.length) throw new Error('부품 JSON 오류:\n' + errs.slice(0, 10).join('\n'));
        design = { type: 'custom', parts: j.parts, params: { period: +j.period || 0 }, title: j.title };
      } else {
        if (!TEMPLATES[j.type]) throw new Error(`알 수 없는 템플릿: ${j.type}`);
        design = { type: j.type, params: j.params || {}, title: j.title };
      }
      const built = buildDesign(design); // 오류 시 throw
      p.revisions.push({ at: new Date().toISOString(), note: `AI 적용 전 (${kind})`, design: p.design });
      p.design = design;
      if (j.title && !p.title) p.title = j.title;
      p.aiNotes.push({ at: new Date().toISOString(), kind, questions: j.questions || [], suggestions: j.suggestions || [], risks: j.risks || [], assumptions: j.assumptions || [] });
      if (j.questions?.length) p.analysis = { ...(p.analysis || {}), questions: [...new Set([...(j.questions || []), ...(p.analysis?.questions || [])])] };
      db.save();
      out.innerHTML = `<div class="vrow ok"><b>✔ 설계 적용 완료 — 부품 ${built.parts.length}개</b><span>${esc(getTemplate(design.type).name)}</span><a href="#/project/${p.id}/design">③ 3D 설계에서 확인·검증 →</a></div>`;
    } catch (err) {
      out.innerHTML = `<div class="vrow bad"><b>적용 실패</b><span class="sub" style="white-space:pre-wrap">${esc(err.message)}</span><span class="sub">AI에게 "JSON 형식만 다시 출력해줘"라고 요청해 보세요.</span></div>`;
    }
  };
}
