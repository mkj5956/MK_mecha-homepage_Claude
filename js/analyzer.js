// =============================================================
//  의뢰 내용 분석기 (외부 API 없이 브라우저에서 동작하는 규칙 기반 분석)
//  1) 제품 유형 판별 (키워드 점수)   2) 치수·사양 수치 추출 (단위 변환)
//  3) 누락 정보 → 추가 질문 생성     4) 설계 제안사항 생성
//  더 정교한 분석은 관리자 페이지의 "AI 도우미"(구독형 Claude/ChatGPT에 복사·붙여넣기)로 보완.
// =============================================================
import { TEMPLATES, defaultParams, clampParams } from './templates.js';
import { COMMON_QUESTIONS, SUGGEST_RULES } from './kb.js';

const UNIT_MM = { mm: 1, '㎜': 1, cm: 10, '㎝': 10, m: 1000, '미터': 1000, '센치': 10, '센티': 10, '밀리': 1 };

function toNumber(s) { return Number(String(s).replace(/,/g, '')); }

function convert(value, unit, target) {
  unit = (unit || '').toLowerCase();
  if (target === 'mm') return UNIT_MM[unit] ? value * UNIT_MM[unit] : value;
  if (target === 'kg') return /^(t|톤|ton)$/.test(unit) ? value * 1000 : unit === 'g' ? value / 1000 : value;
  if (target === 'kgf') return /^(t|톤|ton|tf)$/.test(unit) ? value * 1000 : /^kn$/.test(unit) ? value * 101.97 : /^n$/.test(unit) ? value / 9.81 : value;
  if (target === 'm/min') return /m\/s|mps/.test(unit) ? value * 60 : /mm\/s/.test(unit) ? (value * 60) / 1000 : value;
  if (target === 'mm/s') return /m\/min/.test(unit) ? (value * 1000) / 60 : /m\/s/.test(unit) && !/mm/.test(unit) ? value * 1000 : value;
  return value;
}

/** 제품 유형 점수 */
export function detectType(text) {
  const t = text.toLowerCase();
  const scores = Object.values(TEMPLATES).map((tp) => {
    let s = 0;
    for (const k of tp.keywords) { const n = t.split(k.toLowerCase()).length - 1; s += n * (k.length >= 3 ? 2 : 1.5); }
    return { key: tp.key, name: tp.name, score: s };
  }).sort((a, b) => b.score - a.score);
  const best = scores[0].score > 0 ? scores[0] : { key: 'frame', name: TEMPLATES.frame.name, score: 0 };
  const total = scores.reduce((a, b) => a + b.score, 0) || 1;
  return { key: best.key, confidence: scores[0].score ? best.score / total : 0, ranking: scores };
}

const NUM = '([0-9][0-9,]*(?:\\.[0-9]+)?)';
const UNIT = '(mm|㎜|cm|㎝|m/min|mm/s|m/s|m|미터|센치|센티|밀리|kgf|kg|g|톤|ton|t|kn|n|w|kw|rpm|초|s|도|°)?';

/** 텍스트 안의 "라벨 ... 숫자 단위" 패턴으로 파라미터 추출 */
export function extractParams(text, typeKey) {
  const tp = TEMPLATES[typeKey];
  const found = {};
  const evidence = [];
  if (!tp) return { params: {}, evidence };
  const flat = text.replace(/\s+/g, ' ');
  for (const pr of tp.params) {
    if (pr.type === 'select') continue;
    for (const alias of pr.alias || []) {
      const re = new RegExp(`${alias}\\s*(?:은|는|이|가|:|=|약|대략|최대|최소|정도|\\s)*\\s*${NUM}\\s*${UNIT}`, 'i');
      const m = flat.match(re);
      if (m) {
        let v = toNumber(m[1]);
        const unit = m[2] || '';
        const target = pr.unit;
        if (target === 'mm' && !unit && v < 20) v *= 1000; // "길이 1.5" → m 로 간주
        v = convert(v, unit, target);
        if (Number.isFinite(v)) { found[pr.key] = v; evidence.push(`${pr.label}: "${m[0].trim()}" → ${+v.toFixed(2)} ${pr.unit}`); }
        break;
      }
    }
  }
  // 단위가 숫자 뒤에 오는 단독 표기: "100kg 제품", "6분할"
  for (const pr of tp.params) {
    if (found[pr.key] !== undefined || pr.type === 'select') continue;
    let m = null;
    if (pr.unit === 'kg') m = flat.match(new RegExp(`${NUM}\\s*(kg|톤|ton|t)(?![a-z])`, 'i'));
    if (pr.post) m = flat.match(new RegExp(`${NUM}\\s*(?:${pr.post.join('|')})`));
    if (m) { found[pr.key] = pr.unit === 'kg' ? convert(toNumber(m[1]), m[2], 'kg') : toNumber(m[1]); evidence.push(`${pr.label}: "${m[0]}" → ${found[pr.key]} ${pr.unit}`); }
  }
  // "1500x400x800", "1500*400*800" 형태 → 앞의 mm 파라미터에 순서대로
  const dims = flat.match(new RegExp(`${NUM}\\s*(?:mm)?\\s*[x×*X]\\s*${NUM}\\s*(?:mm)?(?:\\s*[x×*X]\\s*${NUM})?\\s*(mm|cm|m)?`));
  if (dims) {
    const mmParams = tp.params.filter((p) => p.unit === 'mm' && p.type !== 'select');
    const vals = [dims[1], dims[2], dims[3]].filter(Boolean).map((v) => convert(toNumber(v), dims[4] || 'mm', 'mm'));
    vals.forEach((v, i) => { const pr = mmParams[i]; if (pr && found[pr.key] === undefined) { found[pr.key] = v; evidence.push(`${pr.label}: 치수 표기 "${dims[0]}" → ${v} mm`); } });
  }
  // 프레스: "1톤" 등 단독 표기
  if (typeKey === 'press' && found.force === undefined) {
    const m = flat.match(new RegExp(`${NUM}\\s*(톤|ton|tf|kgf|kn)`, 'i'));
    if (m) { found.force = convert(toNumber(m[1]), m[2], 'kgf'); evidence.push(`가압력: "${m[0]}" → ${found.force} kgf`); }
  }
  return { params: found, evidence };
}

export function extractMeta(text) {
  const flat = text.replace(/\s+/g, ' ');
  const meta = {};
  let m;
  if ((m = flat.match(/([0-9]+)\s*(대|세트|set|sets|식|units?)(?![a-zA-Z가-힣])/i))) meta.qty = +m[1];
  if ((m = flat.match(/([0-9][0-9,.]*)\s*(억|천만|백만|만)\s*원?/))) {
    const mul = { 억: 1e8, 천만: 1e7, 백만: 1e6, 만: 1e4 }[m[2]];
    meta.budget = toNumber(m[1]) * mul;
  }
  if ((m = flat.match(/([0-9]+)\s*(주|개월|달|일)\s*(이내|안에|내|까지|정도)/))) meta.deadline = `${m[1]}${m[2]} ${m[3]}`;
  return meta;
}

/**
 * 종합 분석
 * @param {string} text 의뢰 내용(용도·성능·목적 + OCR 텍스트 포함)
 * @param {string} [forceType] 고객이 직접 고른 유형
 */
export function analyze(text, forceType) {
  const det = detectType(text);
  const type = forceType && TEMPLATES[forceType] ? forceType : det.key;
  const tp = TEMPLATES[type];
  const ex = extractParams(text, type);
  const params = clampParams(type, { ...defaultParams(type), ...ex.params });
  const suggestions = [];
  for (const r of SUGGEST_RULES) {
    if (r.re.test(text)) {
      suggestions.push(r.text);
      if (r.set) for (const [k, v] of Object.entries(r.set)) if (tp.params.some((p) => p.key === k)) params[k] = v;
    }
  }
  const missing = tp.params.filter((p) => p.type !== 'select' && ex.params[p.key] === undefined);
  const questions = [
    ...missing.map((p) => ({ id: 'param_' + p.key, q: `${p.label}은(는) 얼마인가요? (단위: ${p.unit}, 현재 기본값 ${p.def} 적용)`, param: p.key })),
    ...tp.questions,
    ...COMMON_QUESTIONS,
  ];
  const meta = extractMeta(text);
  if (!suggestions.length) suggestions.push('입력하신 내용 기준 표준 사양으로 컨셉을 구성했습니다. 3D 화면에서 치수를 조정해 보세요.');
  if (det.confidence < 0.4 && !forceType) suggestions.unshift(`제품 유형 판별 신뢰도가 낮습니다 (${Math.round(det.confidence * 100)}%). 아래에서 유형을 직접 선택해 주세요.`);
  return { type, typeName: tp.name, confidence: det.confidence, ranking: det.ranking, params, extracted: ex.params, evidence: ex.evidence, questions, suggestions, meta };
}
