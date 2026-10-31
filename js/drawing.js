// =============================================================
//  2D 가공도면 자동 생성기
//  - 3각법(KS B 0001) 정면/평면/우측면도, A3 가로(420×297)
//  - 치수 자동 기입, 구멍 콜아웃, 재질별 주기(注記) 자동 생성, 표제란, 조립도 BOM
//  - 동일한 도형 원본(prims)에서 SVG(미리보기·인쇄)와 DXF(CAD/가공업체 전달)를 출력
// =============================================================
import { MATERIALS, PROCESSES, boltOfHole, tolOf } from './kb.js';
import { bomRows, fmtN } from './estimator.js';
import { halfExtents } from './engine.js';

const SHEET = { w: 420, h: 297 };
const SCALES = [5, 2, 1, 1 / 2, 1 / 5, 1 / 10, 1 / 20, 1 / 50];
const scaleText = (s) => (s >= 1 ? `${s}:1` : `1:${Math.round(1 / s)}`);

// ---------- primitive builders ----------
class Prims {
  constructor() { this.list = []; }
  line(x1, y1, x2, y2, lt = 'thick', layer) { this.list.push({ t: 'line', x1, y1, x2, y2, lt, layer: layer || LAYER[lt] }); }
  rect(x, y, w, h, lt = 'thick') { this.line(x, y, x + w, y, lt); this.line(x + w, y, x + w, y + h, lt); this.line(x + w, y + h, x, y + h, lt); this.line(x, y + h, x, y, lt); }
  circle(cx, cy, r, lt = 'thick') { this.list.push({ t: 'circle', cx, cy, r, lt, layer: LAYER[lt] }); }
  text(x, y, s, h = 3.5, anchor = 'start', rot = 0, layer = 'TEXT') { this.list.push({ t: 'text', x, y, s: String(s), h, anchor, rot, layer }); }
  tri(pts, layer = 'DIM') { this.list.push({ t: 'tri', pts, layer }); }
}
const LAYER = { thick: 'OUTLINE', thin: 'DIM', hidden: 'HIDDEN', center: 'CENTER', frame: 'FRAME' };

function arrow(P, x, y, dx, dy) { // 화살표 끝점 (x,y), 방향 (dx,dy) = 화살이 가리키는 방향
  const L = 3, W = 0.9, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  P.tri([[x, y], [x - ux * L - uy * W, y - uy * L + ux * W], [x - ux * L + uy * W, y - uy * L - ux * W]]);
}

/** 수평 치수: 도면상 x1~x2, 대상 y=yf, 치수선 y=yd */
function dimH(P, x1, x2, yf, yd, label) {
  const s = Math.sign(yd - yf) || 1;
  P.line(x1, yf + s * 1, x1, yd + s * 2, 'thin'); P.line(x2, yf + s * 1, x2, yd + s * 2, 'thin');
  P.line(x1, yd, x2, yd, 'thin');
  if (Math.abs(x2 - x1) > 8) { arrow(P, x1, yd, -1, 0); arrow(P, x2, yd, 1, 0); P.text((x1 + x2) / 2, yd + 1, label, 3, 'middle', 0, 'DIM'); }
  else { arrow(P, x1, yd, 1, 0); arrow(P, x2, yd, -1, 0); P.line(x2, yd, x2 + 8, yd, 'thin'); P.text(x2 + 2, yd + 1, label, 3, 'start', 0, 'DIM'); }
}
/** 수직 치수: 도면상 y1~y2, 대상 x=xf, 치수선 x=xd */
function dimV(P, y1, y2, xf, xd, label) {
  const s = Math.sign(xd - xf) || -1;
  P.line(xf + s * 1, y1, xd + s * 2, y1, 'thin'); P.line(xf + s * 1, y2, xd + s * 2, y2, 'thin');
  P.line(xd, y1, xd, y2, 'thin');
  if (Math.abs(y2 - y1) > 8) { arrow(P, xd, y1, 0, -1); arrow(P, xd, y2, 0, 1); P.text(xd - 1, (y1 + y2) / 2, label, 3, 'middle', 90, 'DIM'); }
  else { arrow(P, xd, y1, 0, 1); arrow(P, xd, y2, 0, -1); P.line(xd, y2, xd, y2 + 8, 'thin'); P.text(xd - 1, y2 + 2, label, 3, 'start', 90, 'DIM'); }
}
function centerCross(P, cx, cy, r) { const e = r + 2; P.line(cx - e, cy, cx + e, cy, 'center'); P.line(cx, cy - e, cx, cy + e, 'center'); }

// ---------- 테두리 / 표제란 / 주기 ----------
function frame(P, meta, title) {
  P.rect(10, 10, SHEET.w - 20, SHEET.h - 20, 'thick');
  P.rect(5, 5, SHEET.w - 10, SHEET.h - 10, 'thin');
  // 중심 마크
  P.line(SHEET.w / 2, 5, SHEET.w / 2, 10, 'thick'); P.line(SHEET.w / 2, SHEET.h - 10, SHEET.w / 2, SHEET.h - 5, 'thick');
  P.line(5, SHEET.h / 2, 10, SHEET.h / 2, 'thick'); P.line(SHEET.w - 10, SHEET.h / 2, SHEET.w - 5, SHEET.h / 2, 'thick');
  // 표제란 (우하단 180×44)
  const x0 = SHEET.w - 10 - 180, y0 = 10, W = 180;
  P.rect(x0, y0, W, 44, 'thick');
  const rows = [y0 + 11, y0 + 22, y0 + 33];
  rows.forEach((y) => P.line(x0, y, x0 + W, y, 'thin'));
  [x0 + 22, x0 + 90, x0 + 112].forEach((x) => P.line(x, y0, x, y0 + 33, 'thin'));
  const cell = (cx, cy, label, val, valH = 3.2) => { P.text(cx + 1.5, cy + 7, label, 2.5); P.text(cx + 1.5, cy + 2.5, val, valH); };
  // 맨 위 줄: 회사명 / 도면명
  P.text(x0 + 2, y0 + 37.5, meta.company || '', 3.5);
  P.text(x0 + W - 2, y0 + 37.5, title.name, 5, 'end');
  // 2행
  cell(x0, y0 + 22, '도번', ''); P.text(x0 + 24, y0 + 25, title.dwgNo, 3.5);
  cell(x0 + 90, y0 + 22, '척도', ''); P.text(x0 + 114, y0 + 25, title.scale, 3.5);
  P.text(x0 + 150, y0 + 25, '3각법 ⊕◁', 3);
  // 3행
  cell(x0, y0 + 11, '재질', ''); P.text(x0 + 24, y0 + 14, title.material, 3.2);
  cell(x0 + 90, y0 + 11, '수량', ''); P.text(x0 + 114, y0 + 14, title.qty, 3.5);
  P.text(x0 + 150, y0 + 14, `일반공차 ${title.tolClass || 'ISO 2768-m'}`, 2.5);
  // 4행
  cell(x0, y0, '처리', ''); P.text(x0 + 24, y0 + 3, title.finish, 2.7);
  cell(x0 + 90, y0, '작성', ''); P.text(x0 + 114, y0 + 3, `${meta.designer || ''} ${meta.date || ''}`, 2.7);
  // 프로젝트
  P.text(15, SHEET.h - 16, `${meta.projectNo || ''}  ${meta.projectTitle || ''}`, 3);
}

function notesBlock(P, notes, x = 15, y = 50) {
  P.text(x, y, '주기 (NOTES)', 3.5);
  notes.forEach((n, i) => P.text(x + 2, y - 6 - i * 5, `${i + 1}. ${n}`, 2.8));
}

export function autoNotes(part, maxDim) {
  const m = MATERIALS[part.mat] || {};
  const notes = [`일반공차: KS B ISO 2768-m (최대치수 ${fmtN(maxDim)}mm → ±${tolOf(maxDim) ?? 2})`];
  notes.push('지시 없는 모따기 C0.5, 날카로운 모서리 제거');
  notes.push('지시 없는 면의 표면거칠기 Ra 6.3 (√)');
  if (m.finish && m.finish !== '무처리') notes.push(`표면처리: ${m.finish}`);
  for (const n of m.notes || []) notes.push(n);
  const holes = part.holes || [];
  const bolts = [...new Set(holes.map((h) => boltOfHole(h.d)).filter(Boolean))];
  if (bolts.length) notes.push(`${bolts.join(', ')} 볼트용 관통구멍: KS B ISO 273 (중급)`);
  for (const n of part.extraNotes || []) notes.push(n);
  if (part.proc === 'weld') notes.push('용접: 연속 필릿 각장 4mm 이상, 용접 후 응력제거 및 평면도 1mm 이내');
  if (part.proc === 'lathe') notes.push('동심도 Ø0.05 이내, 센터 구멍 허용');
  if (part.proc === 'profile') notes.push('알루미늄 압출 프로파일 사용 가능 (단면 동등 이상), 절단면 직각도 0.2');
  if (part.proc === 'sheet') notes.push('판금 절곡 내측 R = 판두께, 버(Burr) 제거');
  return notes;
}

// ---------- 부품도 ----------
export function partDrawing(part, qty, meta, dwgNo) {
  const P = new Prims();
  const isCyl = part.shape === 'cyl';
  // 도면 기준 치수: 원통은 축을 수평으로
  const X = isCyl ? part.len : part.size[0];
  const Y = isCyl ? part.d : part.size[1];
  const Z = isCyl ? part.d : part.size[2];
  const gap = 28, regW = 360, regH = 200;
  const needW = isCyl ? X + Y : X + Y, needH = isCyl ? Z : Z + Y;
  const s = SCALES.find((k) => needW * k + gap + 40 <= regW && needH * k + gap + 30 <= regH) || SCALES.at(-1);
  const groupW = needW * s + gap, groupH = needH * s + (isCyl ? 0 : gap);
  const fx = 25 + (regW - groupW) / 2 + 10, fy = 62 + (regH - groupH) / 2;
  const Xs = X * s, Ys = Y * s, Zs = Z * s;

  if (isCyl) {
    // 정면도: 축 수평
    P.rect(fx, fy, Xs, Zs);
    P.line(fx - 4, fy + Zs / 2, fx + Xs + 4, fy + Zs / 2, 'center');
    // 모따기 표시
    const c = Math.min(1 * s, Zs * 0.05);
    if (c > 0.3) { P.line(fx + c, fy, fx + c, fy + Zs, 'thick'); P.line(fx + Xs - c, fy, fx + Xs - c, fy + Zs, 'thick'); }
    dimH(P, fx, fx + Xs, fy, fy - 10, fmtN(X));
    dimV(P, fy, fy + Zs, fx, fx - 10, 'Ø' + fmtN(Z));
    // 측면도: 원
    const sx = fx + Xs + gap + Ys / 2, sy = fy + Zs / 2;
    P.circle(sx, sy, Ys / 2);
    centerCross(P, sx, sy, Ys / 2);
  } else {
    // 정면도 (X-Z)
    P.rect(fx, fy, Xs, Zs);
    const holes = part.holes || [];
    for (const h of holes) {
      const hx = fx + (h.x + X / 2) * s, r = (h.d / 2) * s;
      P.line(hx - r, fy, hx - r, fy + Zs, 'hidden'); P.line(hx + r, fy, hx + r, fy + Zs, 'hidden');
      P.line(hx, fy - 2, hx, fy + Zs + 2, 'center');
    }
    dimH(P, fx, fx + Xs, fy, fy - 10, fmtN(X));
    dimV(P, fy, fy + Zs, fx, fx - 10, fmtN(Z));
    // 평면도 (X-Y), 정면도 위
    const ty = fy + Zs + gap;
    P.rect(fx, ty, Xs, Ys);
    for (const h of holes) {
      const hx = fx + (h.x + X / 2) * s, hy = ty + (h.y + Y / 2) * s, r = (h.d / 2) * s;
      P.circle(hx, hy, r); centerCross(P, hx, hy, r);
    }
    dimV(P, ty, ty + Ys, fx, fx - 10, fmtN(Y));
    if (holes.length) {
      const xs = [...new Set(holes.map((h) => +(h.x + X / 2).toFixed(2)))].sort((a, b) => a - b);
      const ys = [...new Set(holes.map((h) => +(h.y + Y / 2).toFixed(2)))].sort((a, b) => a - b);
      let prev = 0;
      for (const x of xs) { if (x - prev > 0.01) dimH(P, fx + prev * s, fx + x * s, ty + Ys, ty + Ys + 8, fmtN(x - prev)); prev = x; }
      prev = 0;
      for (const y of ys) { if (y - prev > 0.01) dimV(P, ty + prev * s, ty + y * s, fx + Xs, fx + Xs + 8, fmtN(y - prev)); prev = y; }
      // 구멍 콜아웃 (지름별)
      const byD = {};
      holes.forEach((h) => { (byD[h.d] = byD[h.d] || []).push(h); });
      Object.entries(byD).forEach(([d, hs], k) => {
        const h = hs[0], hx = fx + (h.x + X / 2) * s, hy = ty + (h.y + Y / 2) * s, r = (d / 2) * s;
        const lx = hx + r * 0.7 + 6 + k * 3, ly = hy + r * 0.7 + 10 + k * 7;
        P.line(hx + r * 0.7, hy + r * 0.7, lx, ly, 'thin'); arrow(P, hx + r * 0.7, hy + r * 0.7, -(lx - hx), -(ly - hy));
        const bolt = boltOfHole(+d);
        const label = `${hs.length > 1 ? hs.length + '-' : ''}Ø${fmtN(+d)} THRU${bolt ? ` (${bolt})` : ''}`;
        P.line(lx, ly, lx + label.length * 1.9, ly, 'thin'); P.text(lx + 1, ly + 1, label, 3, 'start', 0, 'DIM');
      });
    }
    // 우측면도 (Y-Z)
    const sx = fx + Xs + gap;
    P.rect(sx, fy, Ys, Zs);
    for (const h of holes) {
      const hy = sx + (h.y + Y / 2) * s, r = (h.d / 2) * s;
      P.line(hy - r, fy, hy - r, fy + Zs, 'hidden'); P.line(hy + r, fy, hy + r, fy + Zs, 'hidden');
    }
  }
  const m = MATERIALS[part.mat] || { name: part.mat || '-', finish: '-' };
  const maxDim = Math.max(X, Y, Z);
  frame(P, meta, { name: part.name, dwgNo, scale: scaleText(s), material: m.name, qty: `${qty} EA`, finish: m.finish || '-' });
  notesBlock(P, autoNotes(part, maxDim));
  P.text(fx, SHEET.h - 26, `가공: ${PROCESSES[part.proc]?.name || '-'}`, 3);
  return { prims: P.list, scale: s, sheet: SHEET, title: part.name, dwgNo };
}

// ---------- 조립도 + BOM ----------
function projRect(p, view) { // view: 'front'(x,z) 'top'(x,y) 'side'(y,z)
  const e = halfExtents(p), c = p.pos;
  const idx = view === 'front' ? [0, 2] : view === 'top' ? [0, 1] : [1, 2];
  const normal = view === 'front' ? 'y' : view === 'top' ? 'z' : 'x';
  return { cx: c[idx[0]], cy: c[idx[1]], hw: e[idx[0]], hh: e[idx[1]], circle: p.shape === 'cyl' && p.axis === normal, r: p.d / 2 };
}

export function assemblyDrawing(built, meta, dwgNo) {
  const P = new Prims();
  const parts = built.parts.filter((p) => p.shape && !p.bomOnly);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) { const e = halfExtents(p); for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p.pos[i] - e[i]); max[i] = Math.max(max[i], p.pos[i] + e[i]); } }
  const [X, Y, Z] = max.map((v, i) => v - min[i]);
  const gap = 25, regW = 205, regH = 205;
  const s = SCALES.find((k) => (X + Y) * k + gap + 30 <= regW && (Z + Y) * k + gap + 20 <= regH) || SCALES.at(-1);
  const fx = 30, fy = 62;
  const Xs = X * s, Ys = Y * s, Zs = Z * s;
  const origins = { front: [fx, fy, min[0], min[2]], top: [fx, fy + Zs + gap, min[0], min[1]], side: [fx + Xs + gap, fy, min[1], min[2]] };
  const rows = bomRows(built.parts);
  const noOf = new Map(rows.map((r) => [r.pn, r.no]));
  for (const [view, [ox, oy, m0, m1]] of Object.entries(origins)) {
    for (const p of parts) {
      const r = projRect(p, view), cx = ox + (r.cx - m0) * s, cy = oy + (r.cy - m1) * s;
      const lt = p.role === 'work' ? 'hidden' : 'thick';
      if (r.circle) P.circle(cx, cy, r.r * s, lt); else P.rect(cx - r.hw * s, cy - r.hh * s, r.hw * 2 * s, r.hh * 2 * s, lt);
    }
  }
  dimH(P, fx, fx + Xs, fy, fy - 10, fmtN(X));
  dimV(P, fy, fy + Zs, fx, fx - 12, fmtN(Z));
  dimV(P, fy + Zs + gap, fy + Zs + gap + Ys, fx, fx - 12, fmtN(Y));
  // 풍선 (정면도)
  const placed = [];
  const seen = new Set();
  for (const p of parts) {
    const no = noOf.get(p.pn || p.id);
    if (!no || seen.has(no)) continue;
    seen.add(no);
    const r = projRect(p, 'front');
    const px = fx + (r.cx - min[0]) * s, py = fy + (r.cy - min[2]) * s;
    let bx = px + 12, by = py + 10;
    for (let k = 0; k < 40 && placed.some(([x, y]) => Math.hypot(x - bx, y - by) < 8); k++) { by += 7; if (by > fy + Zs + 10) { by = py - 10; bx += 9; } }
    placed.push([bx, by]);
    P.line(px, py, bx - 2.8, by - 2.8 * Math.sign(by - py || 1), 'thin');
    P.circle(px, py, 0.6, 'thin');
    P.circle(bx, by, 3.5, 'thin'); P.text(bx, by - 1.2, no, 3, 'middle', 0, 'DIM');
  }
  // BOM 표 (우상단)
  const bx = SHEET.w - 10 - 180, cols = [12, 46, 66, 16, 40], rh = 6;
  const top = SHEET.h - 15;
  const head = ['No', '품명', '재질 / 규격', '수량', '비고'];
  const tableRows = rows.map((r) => [r.no, r.name, r.matText, r.qty, r.part.std ? '구매품' : (r.sizeText || '')]);
  const drawRow = (vals, y, bold) => {
    let x = bx;
    vals.forEach((v, i) => { const max = Math.floor(cols[i] / 1.75); const sv = String(v); P.text(x + 1.2, y + 1.8, sv.length > max ? sv.slice(0, max - 1) + '…' : sv, bold ? 3 : 2.5); x += cols[i]; });
    P.line(bx, y, bx + 180, y, 'thin');
  };
  P.text(bx, top + 1.5, '부품표 (B.O.M)', 3.5);
  drawRow(head, top - rh, true);
  tableRows.forEach((r, i) => drawRow(r, top - rh * (i + 2), false));
  const bottom = top - rh * (tableRows.length + 1);
  P.line(bx, top, bx + 180, top, 'thick'); P.line(bx, bottom, bx + 180, bottom, 'thick');
  let x = bx; [0, ...cols].forEach((w) => { x += w; P.line(x - (w ? 0 : 0), top, x - (w ? 0 : 0), bottom, 'thin'); });
  P.line(bx, top, bx, bottom, 'thick');

  frame(P, meta, { name: (meta.projectTitle || '조립도') + ' 조립도', dwgNo, scale: scaleText(s), material: '-', qty: `${meta.qty || 1} SET`, finish: '부품도 참조' });
  notesBlock(P, [
    '본 도면은 조립도이며 부품 상세 치수는 각 부품도를 따른다.',
    '구매품은 동등 이상 사양으로 대체 가능 (사전 협의).',
    '조립 후 각 운동부 수동 이송 시 걸림·간섭 없을 것.',
    '볼트 체결: 나사 고정제(중강도) 도포, 규정 토크 체결.',
    `전체 외형: ${fmtN(X)} × ${fmtN(Y)} × ${fmtN(Z)} mm`,
  ]);
  return { prims: P.list, scale: s, sheet: SHEET, title: '조립도', dwgNo };
}

/** 전체 도면 세트: [조립도, 부품도...] */
export function drawingSet(built, meta) {
  const base = meta.projectNo || 'DWG';
  const rows = bomRows(built.parts);
  const set = [assemblyDrawing(built, meta, `${base}-00`)];
  for (const r of rows) {
    if (r.part.std || !r.part.shape) continue;
    const no = `${base}-${String(r.no).padStart(2, '0')}`;
    r.dwgNo = no;
    set.push({ ...partDrawing(r.part, r.qty * (meta.qty || 1), meta, no), pn: r.pn, part: r.part, qty: r.qty });
  }
  return set;
}

// ---------- 출력: SVG ----------
const STYLE = {
  thick: 'stroke:#111;stroke-width:0.5;fill:none',
  thin: 'stroke:#111;stroke-width:0.18;fill:none',
  hidden: 'stroke:#111;stroke-width:0.3;fill:none;stroke-dasharray:3 1.5',
  center: 'stroke:#c22;stroke-width:0.18;fill:none;stroke-dasharray:8 1.5 1.5 1.5',
};
const escXml = (s) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

export function toSVG(dwg) {
  const H = dwg.sheet.h, out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dwg.sheet.w} ${H}" width="${dwg.sheet.w}mm" height="${H}mm" font-family="'Noto Sans KR','Malgun Gothic',sans-serif">`);
  out.push(`<rect x="0" y="0" width="${dwg.sheet.w}" height="${H}" fill="#fff"/>`);
  for (const p of dwg.prims) {
    if (p.t === 'line') out.push(`<line x1="${p.x1.toFixed(2)}" y1="${(H - p.y1).toFixed(2)}" x2="${p.x2.toFixed(2)}" y2="${(H - p.y2).toFixed(2)}" style="${STYLE[p.lt] || STYLE.thin}"/>`);
    else if (p.t === 'circle') out.push(`<circle cx="${p.cx.toFixed(2)}" cy="${(H - p.cy).toFixed(2)}" r="${p.r.toFixed(2)}" style="${STYLE[p.lt] || STYLE.thick}"/>`);
    else if (p.t === 'tri') out.push(`<polygon points="${p.pts.map(([x, y]) => `${x.toFixed(2)},${(H - y).toFixed(2)}`).join(' ')}" fill="#111"/>`);
    else if (p.t === 'text') {
      const a = p.anchor === 'middle' ? 'middle' : p.anchor === 'end' ? 'end' : 'start';
      const tr = p.rot ? ` transform="rotate(${-p.rot} ${p.x.toFixed(2)} ${(H - p.y).toFixed(2)})"` : '';
      out.push(`<text x="${p.x.toFixed(2)}" y="${(H - p.y).toFixed(2)}" font-size="${p.h}" text-anchor="${a}" fill="${p.layer === 'DIM' ? '#0a3d91' : '#111'}"${tr}>${escXml(p.s)}</text>`);
    }
  }
  out.push('</svg>');
  return out.join('\n');
}

// ---------- 출력: DXF (R12 ASCII) ----------
export function toDXF(dwg) {
  const o = [];
  const w = (...kv) => { for (let i = 0; i < kv.length; i += 2) o.push(String(kv[i]), String(kv[i + 1])); };
  w(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$DWGCODEPAGE', 3, 'ANSI_949', 9, '$EXTMIN', 10, 0, 20, 0, 9, '$EXTMAX', 10, dwg.sheet.w, 20, dwg.sheet.h, 0, 'ENDSEC');
  w(0, 'SECTION', 2, 'TABLES');
  w(0, 'TABLE', 2, 'LTYPE', 70, 3);
  w(0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0.0);
  w(0, 'LTYPE', 2, 'HIDDEN', 70, 0, 3, '__ __ __', 72, 65, 73, 2, 40, 4.5, 49, 3.0, 49, -1.5);
  w(0, 'LTYPE', 2, 'CENTER', 70, 0, 3, '____ _ ____', 72, 65, 73, 4, 40, 13.5, 49, 8.0, 49, -2.0, 49, 1.5, 49, -2.0);
  w(0, 'ENDTAB');
  const layers = [['OUTLINE', 7, 'CONTINUOUS'], ['HIDDEN', 5, 'HIDDEN'], ['CENTER', 1, 'CENTER'], ['DIM', 3, 'CONTINUOUS'], ['TEXT', 7, 'CONTINUOUS'], ['FRAME', 7, 'CONTINUOUS']];
  w(0, 'TABLE', 2, 'LAYER', 70, layers.length);
  for (const [n, c, lt] of layers) w(0, 'LAYER', 2, n, 70, 0, 62, c, 6, lt);
  w(0, 'ENDTAB', 0, 'ENDSEC');
  w(0, 'SECTION', 2, 'ENTITIES');
  const f = (v) => v.toFixed(3);
  for (const p of dwg.prims) {
    if (p.t === 'line') w(0, 'LINE', 8, p.layer, 10, f(p.x1), 20, f(p.y1), 30, 0, 11, f(p.x2), 21, f(p.y2), 31, 0);
    else if (p.t === 'circle') w(0, 'CIRCLE', 8, p.layer, 10, f(p.cx), 20, f(p.cy), 30, 0, 40, f(p.r));
    else if (p.t === 'tri') { const [a, b, c] = p.pts; w(0, 'SOLID', 8, p.layer, 10, f(a[0]), 20, f(a[1]), 30, 0, 11, f(b[0]), 21, f(b[1]), 31, 0, 12, f(c[0]), 22, f(c[1]), 32, 0, 13, f(c[0]), 23, f(c[1]), 33, 0); }
    else if (p.t === 'text') {
      const ha = p.anchor === 'middle' ? 1 : p.anchor === 'end' ? 2 : 0;
      w(0, 'TEXT', 8, p.layer, 10, f(p.x), 20, f(p.y), 30, 0, 40, p.h * 0.8, 1, p.s, 50, p.rot || 0);
      if (ha) w(72, ha, 11, f(p.x), 21, f(p.y), 31, 0);
    }
  }
  w(0, 'ENDSEC', 0, 'EOF');
  return o.join('\r\n');
}
