// =============================================================
//  고객용 페이지 로직
//  의뢰 입력 → 규칙기반 분석/질문 → 3D 컨셉(치수 조정·작동 검증) → 3단계 견적 → 접수
// =============================================================
import { CONFIG } from './config.js';
import { analyze } from './analyzer.js';
import { TEMPLATES } from './templates.js';
import { mountDesignPanel } from './designpanel.js';
import { estimate, manwon } from './estimator.js';
import { decodeDesign } from './share.js';
import { remote } from './store.js';
import { $, $$, esc, toast, download, fileToBase64, uid } from './util.js';

// ---------- 설정값 표시 ----------
$$('[data-cfg]').forEach((el) => { el.textContent = CONFIG[el.dataset.cfg] ?? ''; });
$$('[data-cfg-wrap]').forEach((el) => { if (!CONFIG[el.dataset.cfgWrap]) el.classList.add('hidden'); });
$$('[data-cfg-mail]').forEach((a) => { a.textContent = CONFIG.email; a.href = 'mailto:' + CONFIG.email; });
$$('[data-cfg-tel]').forEach((a) => { a.textContent = CONFIG.phone; a.href = 'tel:' + CONFIG.phone.replace(/[^0-9+]/g, ''); });
$$('[data-cfg-kakao]').forEach((a) => { a.href = CONFIG.kakao || '#'; });
$('#yr').textContent = new Date().getFullYear();
document.title = `${CONFIG.company} 기계설계`;

const S = { type: '', files: [], analysis: null, panel: null, design: null, built: null, verify: null, quotes: null, tier: 'mid', answers: {}, ocrText: '', ref: '', refImg: null };

// ---------- 1. 유형 칩 ----------
const chips = $('#typeChips');
chips.innerHTML = `<button type="button" class="on" data-t="">자동 판별</button>` + Object.values(TEMPLATES).map((t) => `<button type="button" data-t="${t.key}">${esc(t.name)}</button>`).join('');
chips.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  $$('button', chips).forEach((x) => x.classList.toggle('on', x === b));
  S.type = b.dataset.t;
});

// ---------- 파일 업로드 ----------
const drop = $('#drop'), finput = $('#files');
drop.addEventListener('click', () => finput.click());
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finput.click(); } });
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); });
finput.addEventListener('change', () => { addFiles(finput.files); finput.value = ''; });

function addFiles(list) {
  for (const f of list) {
    if (f.size > CONFIG.maxUploadMB * 1024 * 1024) { toast(`${f.name}: ${CONFIG.maxUploadMB}MB를 초과합니다.`); continue; }
    if (S.files.length >= 8) { toast('파일은 최대 8개까지 첨부할 수 있습니다.'); break; }
    S.files.push({ id: uid('f'), file: f, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null });
  }
  renderThumbs();
}
function renderThumbs() {
  $('#thumbs').innerHTML = S.files.map((x) => `<div class="thumb">${x.url ? `<img src="${x.url}" alt="">` : `<div class="pdf">${x.file.name.toLowerCase().endsWith('.pdf') ? '📄' : '📐'}</div>`}
    <span title="${esc(x.file.name)}">${esc(x.file.name)}</span><button type="button" data-del="${x.id}" aria-label="삭제">×</button>
    ${x.url || x.file.type === 'application/pdf' ? `<button type="button" class="ref" data-ref="${x.id}">3D에 띄우기</button>` : ''}</div>`).join('');
  $('#ocrBtn').disabled = !S.files.some((x) => x.url || x.file.type === 'application/pdf');
}
$('#thumbs').addEventListener('click', async (e) => {
  const del = e.target.closest('[data-del]'), ref = e.target.closest('[data-ref]');
  if (del) { S.files = S.files.filter((x) => x.id !== del.dataset.del); renderThumbs(); }
  if (ref) {
    const f = S.files.find((x) => x.id === ref.dataset.ref);
    const img = f.url ? await loadImage(f.url) : await pdfFirstPage(f.file);
    S.refImg = img;
    if (S.panel) { S.panel.viewer.addReferenceImage(img); toast('스케치를 3D 화면 뒤편에 참조 패널로 띄웠습니다.'); location.hash = '#concept'; }
    else toast('먼저 "분석하고 3D 컨셉 보기"를 눌러주세요. 이후 자동으로 표시됩니다.');
  }
});
const loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

// ---------- OCR / PDF 텍스트 (외부 API 없이 브라우저 내에서 실행) ----------
let pdfjs = null;
async function getPdfjs() {
  if (!pdfjs) {
    pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
  }
  return pdfjs;
}
async function pdfFirstPage(file) {
  const lib = await getPdfjs();
  const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await doc.getPage(1), vp = page.getViewport({ scale: 1.6 });
  const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  return c;
}
async function pdfText(file) {
  const lib = await getPdfjs();
  const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  let out = '';
  for (let i = 1; i <= Math.min(doc.numPages, 10); i++) { const tc = await (await doc.getPage(i)).getTextContent(); out += tc.items.map((x) => x.str).join(' ') + '\n'; }
  return out;
}
$('#ocrBtn').addEventListener('click', async () => {
  const st = $('#ocrStatus'), btn = $('#ocrBtn');
  btn.disabled = true; let text = '';
  try {
    for (const x of S.files) {
      if (x.file.type === 'application/pdf') { st.textContent = `PDF 텍스트 추출 중: ${x.file.name}`; text += await pdfText(x.file); }
      else if (x.url) {
        st.textContent = 'OCR 엔진 로딩 중 (최초 1회, 약 10~20초)…';
        const { createWorker } = await import('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js');
        const worker = await createWorker(['kor', 'eng'], 1, { logger: (m) => { if (m.status === 'recognizing text') st.textContent = `글자 인식 중 ${Math.round(m.progress * 100)}%`; } });
        const { data } = await worker.recognize(x.url); text += data.text + '\n'; await worker.terminate();
      }
    }
    S.ocrText = text.trim();
    if (S.ocrText) {
      $('#desc').value += (($('#desc').value ? '\n\n' : '') + '[첨부 파일에서 읽은 내용]\n' + S.ocrText.slice(0, 2000));
      st.textContent = `✔ ${S.ocrText.length}자 인식 — 설명란에 추가했습니다. 틀린 부분은 고쳐주세요.`;
    } else st.textContent = '인식된 글자가 없습니다. 손글씨는 인식률이 낮을 수 있어요 — 설계자가 직접 검토합니다.';
  } catch (err) { st.textContent = 'OCR 실패: ' + err.message; }
  btn.disabled = false;
});

// ---------- 2. 분석 ----------
$('#analyzeBtn').addEventListener('click', () => {
  const text = `${$('#title').value}\n${$('#desc').value}`.trim();
  if (text.length < 4 && !S.files.length) { toast('만들고 싶은 기계를 간단히라도 적어주세요.'); $('#desc').focus(); return; }
  S.analysis = analyze(text, S.type || undefined);
  renderAnalysis();
  startConcept({ type: S.analysis.type, params: S.analysis.params, title: $('#title').value || S.analysis.typeName });
  $('#analysis').scrollIntoView({ behavior: 'smooth' });
});

function renderAnalysis() {
  const a = S.analysis;
  $('#analysis').classList.remove('locked');
  $('#typeResult').textContent = a.typeName;
  $('#typeConf').textContent = S.type ? '고객님이 직접 선택한 유형' : `자동 판별 신뢰도 ${Math.round(a.confidence * 100)}% · 다른 후보: ${a.ranking.slice(1, 3).filter((r) => r.score > 0).map((r) => r.name).join(', ') || '없음'}`;
  $('#evidence').innerHTML = a.evidence.length ? a.evidence.map((e) => `<li>${esc(e)}</li>`).join('') : '<li>수치 정보를 찾지 못해 표준값을 적용했습니다.</li>';
  if (a.meta.qty) $('#qty').value = a.meta.qty;
  $('#sugg').innerHTML = a.suggestions.map((s) => `<li>${esc(s)}</li>`).join('');
  $('#qa').innerHTML = a.questions.map((q) => `<div class="q"><label for="q_${q.id}">${esc(q.q)}</label>
    <input id="q_${q.id}" data-qid="${q.id}" ${q.param ? `data-param="${q.param}" inputmode="decimal" placeholder="숫자 입력 (선택)"` : 'placeholder="답변 (선택)"'} value="${esc(S.answers[q.id] || '')}"></div>`).join('');
  $$('#qa input').forEach((inp) => inp.addEventListener('change', () => {
    S.answers[inp.dataset.qid] = inp.value;
    if (inp.dataset.param && S.panel) {
      const v = parseFloat(inp.value.replace(/,/g, ''));
      if (Number.isFinite(v)) { S.panel.setDesign({ ...S.panel.design, params: { ...S.panel.design.params, [inp.dataset.param]: v } }, true); toast('3D 모델에 반영했습니다.'); }
    }
  }));
}

// ---------- 3. 3D 컨셉 ----------
function startConcept(design) {
  ['#concept', '#quote', '#submit'].forEach((s) => $(s).classList.remove('locked'));
  if (!S.panel) {
    S.panel = mountDesignPanel($('#panel'), { design, onChange: onDesignChange, compact: true });
  } else S.panel.setDesign(design);
  if (S.refImg) S.panel.viewer.addReferenceImage(S.refImg);
  $('#refRow').innerHTML = `<button type="button" class="btn ghost sm" id="shot">📷 화면 저장(PNG)</button>` + (S.refImg ? '<button type="button" class="btn ghost sm" id="unref">스케치 패널 숨기기</button>' : '');
  $('#shot').onclick = () => download(`concept_${Date.now()}.png`, dataURLtoBlob(S.panel.viewer.screenshot()));
  if ($('#unref')) $('#unref').onclick = () => { S.panel.viewer.removeReferenceImage(); S.refImg = null; $('#unref').remove(); };
}
function dataURLtoBlob(u) { const [h, b] = u.split(','); const bin = atob(b); return new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))], { type: h.match(/:(.*?);/)[1] }); }

function onDesignChange(design, built, verify) {
  S.design = design; S.built = built; S.verify = verify;
  renderQuote();
}

// ---------- 4. 견적 ----------
$('#qty').addEventListener('change', renderQuote);
function renderQuote() {
  if (!S.built) return;
  const qty = Math.max(1, +$('#qty').value || 1);
  S.quotes = estimate(S.built, { qty });
  const bullets = {
    low: ['국산 범용 구매품', '기본 표면처리(도장)', '스위치·인버터 단순 제어', '표준 납기'],
    mid: ['검증된 브랜드 부품', 'KS 일반공차(중급) 가공', '소형 PLC 자동 제어', '시운전·사용자 교육'],
    high: ['일본/독일 프리미엄 부품', '정밀 공차·고급 표면처리', 'PLC + HMI + 안전장치', '상세 매뉴얼·1년 A/S'],
  };
  $('#tiers').innerHTML = S.quotes.map((q) => `<div class="card tier ${q.key === S.tier ? 'on' : ''}" data-tier="${q.key}" tabindex="0" role="button" aria-pressed="${q.key === S.tier}">
    <span class="badge ${q.key === 'mid' ? 'blue' : ''}">${q.name} · ${q.en}${q.key === 'mid' ? ' · 추천' : ''}</span>
    <div class="price">${manwon(q.total)}</div>
    <div class="rng">예상 범위 ${manwon(q.range[0])} ~ ${manwon(q.range[1])}${qty > 1 ? ` · ${qty}대 합계` : ''}</div>
    <ul>${bullets[q.key].map((b) => `<li>${b}</li>`).join('')}</ul>
    <p class="muted" style="margin:0">설계 약 ${Math.round(q.designH)}시간 · 중량 약 ${Math.round(q.massKg)}kg</p></div>`).join('');
  $$('#tiers .tier').forEach((el) => {
    const pick = () => { S.tier = el.dataset.tier; renderQuote(); };
    el.addEventListener('click', pick);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
}

// ---------- 5. 접수 ----------
$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target).entries());
  if (fd.website) return; // 스팸 봇 차단 (honeypot)
  const btn = $('#submitBtn'), st = $('#submitStatus');
  btn.disabled = true; st.textContent = '접수 중…';
  try {
    const q = S.quotes?.find((x) => x.key === S.tier);
    const payload = {
      ref: S.ref || '',
      customer: { name: fd.name, company: fd.company, phone: fd.phone, email: fd.email, contactPref: fd.contactPref },
      request: { title: $('#title').value, text: $('#desc').value, answers: S.answers, chosenType: S.type, deadline: fd.deadline, etc: fd.etc, qty: +$('#qty').value || 1 },
      design: S.design,
      verify: S.verify ? { collisions: S.verify.collisions.collisions.length, checksFailed: S.verify.checks.filter((c) => !c.ok).map((c) => c.item), size: S.verify.size } : null,
      quote: S.quotes ? { tier: S.tier, totals: Object.fromEntries(S.quotes.map((x) => [x.key, x.total])), selected: q?.total } : null,
      submittedAt: new Date().toISOString(),
      files: [],
    };
    if (remote.hasEndpoint()) {
      for (const x of S.files) { st.textContent = `파일 업로드 준비: ${x.file.name}`; payload.files.push({ name: x.file.name, type: x.file.type || 'application/octet-stream', data: await fileToBase64(x.file) }); }
      st.textContent = '전송 중…';
      const res = await remote.submitRequest(payload);
      showDone(res.id);
    } else {
      // Apps Script 미설정 시: 의뢰서 JSON 저장 + 이메일 작성창
      const id = 'REQ-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
      payload.id = id; payload.files = S.files.map((x) => ({ name: x.file.name, note: '이메일에 직접 첨부' }));
      download(`${id}.json`, JSON.stringify(payload, null, 2), 'application/json');
      const body = `[설계 의뢰] ${id}\n\n성함: ${fd.name} / ${fd.company}\n연락처: ${fd.phone} / ${fd.email}\n제품: ${$('#title').value}\n\n${$('#desc').value}\n\n선택 견적: ${q ? q.name + ' ' + manwon(q.total) : '-'}\n\n※ 방금 저장된 ${id}.json 파일과 스케치를 이 메일에 첨부해 주세요.`;
      location.href = `mailto:${CONFIG.email}?subject=${encodeURIComponent('[설계 의뢰] ' + ($('#title').value || id))}&body=${encodeURIComponent(body)}`;
      showDone(id + ' (이메일 발송 필요)');
    }
  } catch (err) {
    st.textContent = '접수 실패: ' + err.message + ' — 아래 연락처로 문의해 주세요.';
    btn.disabled = false;
  }
});
function showDone(id) { $('#form').classList.add('hidden'); $('#done').classList.remove('hidden'); $('#doneNo').textContent = id; $('#done').scrollIntoView({ behavior: 'smooth' }); }

// ---------- 공유 링크 (#c=...) : 설계자가 보낸 컨셉 모델 ----------
(async () => {
  const m = location.hash.match(/#c=([\w-]+)/);
  if (!m) return;
  try {
    const d = await decodeDesign(m[1]);
    S.ref = d.no || '';
    $('#shareBanner').classList.remove('hidden');
    $('#shareNo').textContent = d.no || '';
    $('#title').value = d.title || '';
    $('#submitBtn').textContent = '수정 요청 / 확정 의사 보내기';
    startConcept({ type: d.type, params: d.params, parts: d.parts, title: d.title });
    setTimeout(() => $('#concept').scrollIntoView({ behavior: 'smooth' }), 300);
  } catch (err) { toast('공유 링크를 읽을 수 없습니다: ' + err.message); }
})();
