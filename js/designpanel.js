// =============================================================
//  설계 패널 (고객/관리자 공용 UI 컴포넌트)
//  3D 뷰어 + 치수/사양 편집 슬라이더 + 애니메이션 컨트롤 + 작동 검증 리포트
// =============================================================
import { Viewer } from './viewer.js';
import { buildDesign, getTemplate, TEMPLATES } from './templates.js';
import { checkCollisions, motionRanges, overallBox, halfExtents } from './engine.js';
import { MATERIALS } from './kb.js';
import { fmtN } from './estimator.js';
import { esc } from './util.js';

export function mountDesignPanel(root, { design, onChange, allowTypeChange = true, compact = false } = {}) {
  root.classList.add('design-panel');
  root.innerHTML = `
    <div class="dp-view">
      <div class="dp-canvas"></div>
      <div class="dp-toolbar">
        <button type="button" class="btn sm" data-act="play" aria-label="재생/정지">⏸ 정지</button>
        <input type="range" class="dp-time" min="0" max="1000" value="0" aria-label="작동 시점">
        <select class="dp-speed" aria-label="재생 속도"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select>
        <span class="dp-sep"></span>
        <button type="button" class="btn sm ghost" data-view="iso">ISO</button>
        <button type="button" class="btn sm ghost" data-view="front">정면</button>
        <button type="button" class="btn sm ghost" data-view="top">평면</button>
        <button type="button" class="btn sm ghost" data-view="right">측면</button>
        <label class="chk"><input type="checkbox" class="dp-dims" checked> 치수</label>
      </div>
      <div class="dp-info" hidden></div>
    </div>
    <div class="dp-side">
      ${allowTypeChange ? `<label class="field"><span>제품 유형</span><select class="dp-type">${Object.values(TEMPLATES).map((t) => `<option value="${t.key}">${esc(t.name)}</option>`).join('')}<option value="custom">사용자 정의 (AI JSON)</option></select></label>` : ''}
      <div class="dp-params"></div>
      <div class="dp-verify"></div>
    </div>`;
  if (compact) root.classList.add('compact');
  const viewer = new Viewer(root.querySelector('.dp-canvas'));
  const state = { design: structuredClone(design), built: null, verify: null };
  const $ = (s) => root.querySelector(s);

  const typeSel = $('.dp-type');
  if (typeSel) {
    typeSel.value = state.design.type;
    typeSel.addEventListener('change', () => {
      if (typeSel.value === 'custom' && !state.design.parts?.length) { alert('사용자 정의 설계는 관리자 페이지의 AI 도우미에서 JSON을 붙여넣어 생성합니다.'); typeSel.value = state.design.type; return; }
      state.design = { ...state.design, type: typeSel.value, params: {} };
      rebuild(false);
    });
  }

  function renderParams() {
    const t = getTemplate(state.design.type);
    const p = state.built.params;
    if (!t.params.length) { $('.dp-params').innerHTML = '<p class="muted">사용자 정의 모델은 부품 목록(JSON)으로 정의됩니다. 부품을 클릭해 치수를 확인하세요.</p>'; return; }
    $('.dp-params').innerHTML = `<h4>치수 · 사양 조정</h4>` + t.params.map((pr) => pr.type === 'select'
      ? `<label class="field"><span>${esc(pr.label)}</span><select data-k="${pr.key}">${pr.options.map((o) => `<option value="${o}" ${String(o) === String(p[pr.key]) ? 'selected' : ''}>${esc(MATERIALS[o]?.name || o)}${pr.unit ? ' ' + pr.unit : ''}</option>`).join('')}</select></label>`
      : `<div class="field range"><span>${esc(pr.label)} <em>${pr.unit}</em></span>
          <div class="range-row"><input type="range" data-k="${pr.key}" min="${pr.min}" max="${pr.max}" step="${pr.step}" value="${p[pr.key]}" aria-label="${esc(pr.label)}">
          <input type="number" data-k="${pr.key}" min="${pr.min}" max="${pr.max}" step="${pr.step}" value="${p[pr.key]}" aria-label="${esc(pr.label)} 값"></div></div>`).join('');
    $('.dp-params').querySelectorAll('[data-k]').forEach((inp) => {
      const ev = inp.type === 'range' ? 'input' : 'change';
      inp.addEventListener(ev, () => {
        const k = inp.dataset.k;
        const v = inp.tagName === 'SELECT' ? (isNaN(+inp.value) ? inp.value : +inp.value) : +inp.value;
        state.design.params = { ...state.built.params, [k]: v };
        $('.dp-params').querySelectorAll(`[data-k="${k}"]`).forEach((o) => { if (o !== inp) o.value = v; });
        clearTimeout(state._deb);
        state._deb = setTimeout(() => rebuild(true, true), inp.type === 'range' ? 60 : 0);
      });
    });
  }

  function verify() {
    const col = state.built.period > 0 ? checkCollisions(state.built.parts) : { collisions: [], checkedPairs: 0, steps: 0, movingCount: 0 };
    const ranges = motionRanges(state.built.parts);
    const ob = overallBox(state.built.parts);
    state.verify = { collisions: col, checks: state.built.checks, ranges, size: ob.size };
    viewer.markCollisions(col.collisions.flatMap((c) => [c.a, c.b]));
    const engOk = state.built.checks.every((c) => c.ok), colOk = col.collisions.length === 0;
    $('.dp-verify').innerHTML = `
      <h4>작동 · 설계 검증 ${engOk && colOk ? '<span class="badge ok">통과</span>' : '<span class="badge warn">검토 필요</span>'}</h4>
      <p class="muted">외형 W ${fmtN(ob.size[0])} × D ${fmtN(ob.size[1])} × H ${fmtN(ob.size[2])} mm</p>
      ${state.built.period > 0 ? `<div class="vrow ${colOk ? 'ok' : 'bad'}"><b>${colOk ? '✔' : '✖'} 동적 간섭 검사</b><span>1주기 ${col.steps}단계 × ${col.checkedPairs}쌍 검사 — ${colOk ? '간섭 없음' : col.collisions.length + '건 간섭'}</span>
        ${col.collisions.map((c) => `<span class="sub">⚠ ${esc(c.an)} ↔ ${esc(c.bn)} (시점 ${(c.t * 100).toFixed(0)}%, 겹침 ${c.depth.toFixed(1)}mm) <button type="button" class="link" data-seek="${c.t}">보기</button></span>`).join('')}</div>` : '<div class="vrow ok"><b>✔ 정적 구조물</b><span>운동부 없음 — 구조 검토만 수행</span></div>'}
      ${ranges.map((r) => `<div class="vrow info"><b>↕ ${esc(r.name)}</b><span>${r.rotDeg > 1 ? `회전 ${r.rotDeg.toFixed(0)}°` : `이동 ${['X', 'Y', 'Z'].map((a, i) => (r.travel[i] > 0.5 ? `${a} ${fmtN(r.travel[i])}mm` : '')).filter(Boolean).join(', ')}`}</span></div>`).join('')}
      ${state.built.checks.map((c) => `<div class="vrow ${c.ok ? 'ok' : 'bad'}"><b>${c.ok ? '✔' : '✖'} ${esc(c.item)}</b><span>${esc(c.value)} &nbsp;|&nbsp; 기준 ${esc(c.limit)}</span>${c.note ? `<span class="sub">${esc(c.note)}</span>` : ''}</div>`).join('')}`;
    $('.dp-verify').querySelectorAll('[data-seek]').forEach((b) => b.addEventListener('click', () => { setPlaying(false); viewer.setTime(+b.dataset.seek); }));
    return state.verify;
  }

  function rebuild(keepCamera = true, fromParam = false) {
    state.built = buildDesign(state.design);
    state.design.params = state.built.params;
    viewer.setDesign(state.built, { keepCamera });
    if (!fromParam) renderParams();
    verify();
    $('.dp-time').disabled = !(state.built.period > 0);
    $('[data-act="play"]').disabled = !(state.built.period > 0);
    onChange?.(state.design, state.built, state.verify);
  }

  function setPlaying(v) { viewer.playing = v; $('[data-act="play"]').textContent = v ? '⏸ 정지' : '▶ 재생'; }
  $('[data-act="play"]').addEventListener('click', () => setPlaying(!viewer.playing));
  $('.dp-time').addEventListener('input', (e) => { setPlaying(false); viewer.setTime(e.target.value / 1000); });
  $('.dp-speed').addEventListener('change', (e) => { viewer.speed = +e.target.value; });
  $('.dp-dims').addEventListener('change', (e) => viewer.setShowDims(e.target.checked));
  root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => viewer.view(b.dataset.view)));
  viewer.on('time', (t) => { const s = $('.dp-time'); if (document.activeElement !== s) s.value = Math.round(t * 1000); });
  viewer.on('select', (p) => {
    const info = $('.dp-info');
    if (!p) { info.hidden = true; return; }
    const e = halfExtents(p).map((v) => fmtN(v * 2));
    info.hidden = false;
    info.innerHTML = `<b>${esc(p.name)}</b> <span>${p.shape === 'cyl' ? `Ø${fmtN(p.d)} × ${fmtN(p.len)}L` : e.join(' × ')} mm</span>
      <span>${p.std ? '구매품 · ' + esc(p.spec || '') : esc(MATERIALS[p.mat]?.name || p.mat || '')}</span><button type="button" class="link" data-close>닫기</button>`;
    info.querySelector('[data-close]').onclick = () => viewer.select(null);
  });

  rebuild(false);
  return {
    viewer,
    get design() { return state.design; },
    get built() { return state.built; },
    get verifyResult() { return state.verify; },
    setDesign(d, keepCamera = false) { state.design = structuredClone(d); if (typeSel) typeSel.value = d.type; rebuild(keepCamera); },
    verify,
    setPlaying,
  };
}
