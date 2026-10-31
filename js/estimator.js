// =============================================================
//  견적 산출기 — 저가 / 표준 / 고가 3단계
//  비용 = 설계비 + 재료비 + 가공비 + 표면처리비 + 구매품 + 제어/전장 + 조립 + 시운전 + 운송
//         + 일반관리비·이윤 (부가세 별도)
// =============================================================
import { MATERIALS, PROCESSES, TIERS, CATALOG } from './kb.js';
import { halfExtents } from './engine.js';

export const DEFAULT_RATES = {
  designRate: 60000,   // 설계 시간당 단가 (원/h)
  assemblyRate: 50000, // 조립·시운전 시간당 단가
  overhead: 0.15,      // 일반관리비+이윤
  priceFactor: 1.0,    // 전체 보정 계수 (지역/시세 반영)
};

export function partGeom(p) {
  const e = halfExtents(p).map((v) => v * 2);
  let vol, area;
  if (p.shape === 'cyl') {
    const r = p.d / 2; vol = Math.PI * r * r * p.len; area = 2 * Math.PI * r * r + Math.PI * p.d * p.len;
  } else {
    const [a, b, c] = p.size; vol = a * b * c; area = 2 * (a * b + b * c + a * c);
    for (const h of p.holes || []) vol -= Math.PI * (h.d / 2) ** 2 * c;
  }
  if (p.hollow) { vol *= p.hollow; area *= p.hollow > 0.2 ? 1 : 0.5; }
  return { vol, area, ext: e };
}

/** 같은 pn 끼리 묶어 BOM 행 생성 */
export function bomRows(parts) {
  const rows = new Map();
  for (const p of parts) {
    if (p.bomSkip) continue;
    const key = p.pn || p.id;
    if (!rows.has(key)) rows.set(key, { pn: key, name: p.name, part: p, qty: 0 });
    rows.get(key).qty += p.qty || 1;
  }
  let n = 1;
  const list = [...rows.values()];
  list.sort((a, b) => (a.part.std ? 1 : 0) - (b.part.std ? 1 : 0));
  for (const r of list) {
    r.no = n++;
    const p = r.part;
    if (p.std) { r.matText = p.spec || '구매품'; r.procText = '구매품'; }
    else {
      const m = MATERIALS[p.mat] || { name: p.mat || '-' };
      const g = partGeom(p);
      r.matText = m.name;
      r.procText = PROCESSES[p.proc]?.name || '-';
      r.sizeText = p.shape === 'cyl' ? `Ø${fmtN(p.d)} × ${fmtN(p.len)}L` : p.size.map(fmtN).join(' × ');
      r.massKg = (g.vol / 1000) * (m.density || 7.85) / 1000;
      r.dwgNo = '';
    }
  }
  return list;
}

export const fmtN = (v) => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1));

function machiningHours(p, g) {
  const areaCm2 = g.area / 100, holes = (p.holes || []).length;
  switch (p.proc) {
    case 'milling': return 0.6 + areaCm2 / 1500 + holes * 0.08;
    case 'lathe': return 0.5 + (p.len || 100) / 350;
    case 'sheet': return 0.3 + areaCm2 / 5000 + holes * 0.02;
    case 'weld': return 1.0 + areaCm2 / 2500;
    case 'profile': return 0.15 + holes * 0.05 + 0.1;
    case 'grind': return 1.0 + areaCm2 / 800;
    default: return 0.5;
  }
}

/**
 * @param built  buildDesign() 결과
 * @param opts   {qty, rates}
 */
export function estimate(built, opts = {}) {
  const qty = Math.max(1, opts.qty || 1);
  const R = { ...DEFAULT_RATES, ...(opts.rates || {}) };
  const t = built.template;
  const rows = bomRows(built.parts);
  const uniqueMade = rows.filter((r) => !r.part.std).length;
  const totalParts = rows.reduce((s, r) => s + r.qty, 0);

  return TIERS.map((tier, ti) => {
    let material = 0, machining = 0, finish = 0, purchased = 0;
    const partLines = [];
    for (const r of rows) {
      const p = r.part;
      let unit = 0;
      if (p.std) {
        unit = (p.price?.[ti] ?? 0);
        purchased += unit * r.qty;
      } else {
        const m = MATERIALS[p.mat] || MATERIALS.SS400;
        const g = partGeom(p);
        const kg = (g.vol / 1e6) * m.density;
        const mat = kg * m.priceKg * 1.25 * tier.material + 3000;
        const mach = machiningHours(p, g) * (PROCESSES[p.proc]?.rate || 55000) * tier.machining;
        const fin = Math.max(m.finishCostM2 ? 8000 : 0, (g.area / 1e6) * m.finishCostM2 * (ti === 2 ? 1.2 : 1));
        unit = mat + mach + fin;
        material += mat * r.qty; machining += mach * r.qty; finish += fin * r.qty;
      }
      partLines.push({ no: r.no, name: r.name, qty: r.qty, unit: Math.round(unit), amount: Math.round(unit * r.qty), std: !!p.std });
    }
    const designH = (t.designHours + uniqueMade * 1.5) * tier.design;
    const design = designH * R.designRate;
    const control = t.automated ? CATALOG.control[ti].price : 0;
    const assemblyH = (4 + totalParts * 0.35) * tier.assembly + (t.automated ? 6 : 0);
    const assembly = assemblyH * R.assemblyRate;
    const testrun = (t.automated ? 8 : 2) * R.assemblyRate * tier.assembly;
    const massKg = rows.reduce((s, r) => s + (r.massKg || 0) * r.qty, 0);
    const transport = 120000 + massKg * 600;

    // 수량 학습효과: 2대 이상이면 제작비 대당 8% 할인(최대 25%)
    const learn = qty > 1 ? Math.max(0.75, 1 - 0.08 * Math.log2(qty)) : 1;
    const mfgPerUnit = material + machining + finish + purchased + control + assembly + testrun + transport;
    const mfg = mfgPerUnit * qty * learn;
    const sub = (design + mfg) * R.priceFactor;
    const overhead = sub * R.overhead;
    const total = Math.round((sub + overhead) / 10000) * 10000;
    const lines = [
      ['설계비', design, `${designH.toFixed(0)}h × ${R.designRate.toLocaleString()}원 (3D·2D·BOM 포함)`],
      ['재료비', material * qty * learn, '원자재 + 절단 여유 25%'],
      ['가공비', machining * qty * learn, '가공 공정별 시간당 단가'],
      ['표면처리비', finish * qty * learn, '도장 / 아노다이징 / 도금'],
      ['구매품', purchased * qty * learn, '모터·가이드·실린더·벨트 등'],
      ['제어·전장', control * qty * learn, t.automated ? CATALOG.control[ti].name : '해당 없음'],
      ['조립·배선', assembly * qty * learn, `${assemblyH.toFixed(0)}h`],
      ['시운전·검사', testrun * qty * learn, ''],
      ['포장·운송', transport * qty * learn, `총 중량 약 ${massKg.toFixed(0)}kg`],
      ['일반관리비·이윤', overhead, `${Math.round(R.overhead * 100)}%`],
    ].map(([cat, amount, note]) => ({ cat, amount: Math.round(amount * (cat === '일반관리비·이윤' ? 1 : R.priceFactor)), note }));
    return {
      key: tier.key, name: tier.name, en: tier.en, desc: tier.desc, total, qty,
      range: [Math.round(total * 0.9 / 10000) * 10000, Math.round(total * 1.15 / 10000) * 10000],
      lines, partLines, massKg, designH,
    };
  });
}

export const won = (v) => (Math.round(v) || 0).toLocaleString('ko-KR') + '원';
export const manwon = (v) => {
  const m = Math.round(v / 10000);
  return m >= 10000 ? `${(m / 10000).toFixed(m % 10000 ? 2 : 0)}억원` : `${m.toLocaleString('ko-KR')}만원`;
};
