// =============================================================
//  설계 지식 베이스 (Knowledge Base)
//  - 재질 물성, 가공 단가, 일반공차(KS B ISO 2768), 볼트 구멍(KS B ISO 273),
//    표준 구매품 카탈로그, 견적 등급 계수.
//  - 금액은 2026년 국내 소량 제작 기준 "참고값"입니다.
//    관리자 페이지 > 설정 에서 단가 보정 계수를 조정하거나 이 파일을 직접 수정하세요.
// =============================================================

export const MATERIALS = {
  SS400: {
    name: 'SS400', full: '일반구조용 압연강재 (KS D 3503)', density: 7.85, priceKg: 1600,
    E: 205000, yieldMPa: 245, color: 0x9aa2ac,
    finish: '분체도장 (RAL 7035, 도막 60μm 이상)', finishCostM2: 25000,
    notes: ['용접부 비드 정리 및 스패터 제거', '도장 전 탈지·쇼트 처리'],
  },
  S45C: {
    name: 'S45C', full: '기계구조용 탄소강 (KS D 3752)', density: 7.85, priceKg: 2300,
    E: 205000, yieldMPa: 345, color: 0x9aa3ad,
    finish: '무전해 니켈 도금 (5~8μm)', finishCostM2: 32000,
    notes: ['필요시 고주파 열처리 HRC 50~55', '베어링 끼워맞춤부 연삭 (h6/k6)'],
  },
  AL6061: {
    name: 'AL6061-T6', full: '알루미늄 합금 (KS D 6701)', density: 2.70, priceKg: 7800,
    E: 69000, yieldMPa: 275, color: 0xc9ced6,
    finish: '백색 아노다이징 (8~12μm)', finishCostM2: 22000,
    notes: ['아노다이징 후 치수 변화(+0.01mm) 고려', '탭 가공부 헬리서트 권장 (반복 체결부)'],
  },
  AL5052: {
    name: 'AL5052-H32', full: '알루미늄 판재 (KS D 6701)', density: 2.68, priceKg: 7200,
    E: 70000, yieldMPa: 195, color: 0xd5d9df,
    finish: '헤어라인 후 클리어 아노다이징', finishCostM2: 18000,
    notes: ['절곡 R ≥ 판두께 × 1.0'],
  },
  SUS304: {
    name: 'SUS304', full: '스테인리스강 (KS D 3698)', density: 7.93, priceKg: 7200,
    E: 193000, yieldMPa: 205, color: 0xb8c0c8,
    finish: '산세 부동태 처리 / #400 연마', finishCostM2: 16000,
    notes: ['식품·의료 접촉부 적합', '용접 후 산세 처리, 철분 오염 금지'],
  },
  MCNYLON: {
    name: 'MC나일론', full: 'MC 나일론 (Monomer Cast Nylon)', density: 1.15, priceKg: 12000,
    E: 3500, yieldMPa: 80, color: 0xe8dfc8, finish: '무처리', finishCostM2: 0,
    notes: ['흡습에 의한 치수 변화 고려 (공차 ±0.1 이상)'],
  },
  POM: {
    name: 'POM', full: '폴리아세탈 (POM-C)', density: 1.41, priceKg: 11000,
    E: 2800, yieldMPa: 65, color: 0xf2f2ee, finish: '무처리', finishCostM2: 0,
    notes: ['슬라이딩부 사용 시 표면 Ra 0.8 이하'],
  },
};

export const PROCESSES = {
  milling: { name: '밀링/MCT 가공', rate: 65000 },
  lathe:   { name: 'CNC 선반 가공', rate: 55000 },
  sheet:   { name: '레이저 절단·절곡', rate: 50000 },
  weld:    { name: '제관·용접', rate: 55000 },
  profile: { name: '알루미늄 프로파일 절단·탭', rate: 40000 },
  grind:   { name: '연삭', rate: 70000 },
  std:     { name: '구매품', rate: 0 },
};

// KS B ISO 2768-1 일반공차 (선형 치수) [하한, 상한, 공차]
export const GENERAL_TOL = {
  f: [[0.5, 3, 0.05], [3, 6, 0.05], [6, 30, 0.1], [30, 120, 0.15], [120, 400, 0.2], [400, 1000, 0.3], [1000, 2000, 0.5]],
  m: [[0.5, 3, 0.1], [3, 6, 0.1], [6, 30, 0.2], [30, 120, 0.3], [120, 400, 0.5], [400, 1000, 0.8], [1000, 2000, 1.2], [2000, 4000, 2.0]],
  c: [[0.5, 3, 0.2], [3, 6, 0.3], [6, 30, 0.5], [30, 120, 0.8], [120, 400, 1.2], [400, 1000, 2.0], [1000, 2000, 3.0], [2000, 4000, 4.0]],
};
export function tolOf(size, cls = 'm') {
  const row = GENERAL_TOL[cls].find(([a, b]) => size > a && size <= b);
  return row ? row[2] : null;
}

// KS B ISO 273 볼트 관통 구멍 (중급) + 카운터보어
export const BOLT_HOLES = {
  M4: { thru: 4.5, cbD: 8, cbH: 4.4 },
  M5: { thru: 5.5, cbD: 9.5, cbH: 5.4 },
  M6: { thru: 6.6, cbD: 11, cbH: 6.5 },
  M8: { thru: 9, cbD: 14, cbH: 8.6 },
  M10: { thru: 11, cbD: 17.5, cbH: 10.8 },
  M12: { thru: 13.5, cbD: 20, cbH: 13 },
};
export function boltOfHole(d) {
  return Object.entries(BOLT_HOLES).find(([, v]) => Math.abs(v.thru - d) < 0.05)?.[0] || null;
}

// 견적 등급 [저가, 중간, 고가]
export const TIERS = [
  { key: 'low', name: '저가형', en: 'Economy', desc: '국산 범용 부품, 기본 표면처리, 단순 제어', design: 0.75, material: 0.92, machining: 0.9, assembly: 0.85 },
  { key: 'mid', name: '표준형', en: 'Standard', desc: '검증된 브랜드 부품, 표준 공차, PLC 제어', design: 1.0, material: 1.0, machining: 1.0, assembly: 1.0 },
  { key: 'high', name: '고급형', en: 'Premium', desc: '일본/독일 프리미엄 부품, 정밀 공차, HMI·안전규격 대응', design: 1.45, material: 1.15, machining: 1.3, assembly: 1.25 },
];

// 표준 구매품 카탈로그 (가격: [저가, 표준, 고가] 원)
export const CATALOG = {
  gearMotor: [ // 기어드 인덕션 모터 (W)
    { w: 25, price: [160000, 230000, 380000] }, { w: 40, price: [180000, 260000, 420000] },
    { w: 60, price: [210000, 300000, 480000] }, { w: 90, price: [250000, 350000, 560000] },
    { w: 120, price: [300000, 420000, 650000] }, { w: 200, price: [380000, 520000, 820000] },
    { w: 400, price: [520000, 720000, 1150000] }, { w: 750, price: [780000, 1050000, 1650000] },
  ],
  servo: [ // AC 서보 + 드라이브 세트
    { w: 100, ratedNm: 0.32, maxRpm: 3000, price: [420000, 620000, 950000] },
    { w: 200, ratedNm: 0.64, maxRpm: 3000, price: [480000, 700000, 1080000] },
    { w: 400, ratedNm: 1.27, maxRpm: 3000, price: [560000, 820000, 1250000] },
    { w: 750, ratedNm: 2.39, maxRpm: 3000, price: [720000, 1050000, 1600000] },
    { w: 1000, ratedNm: 3.18, maxRpm: 3000, price: [950000, 1400000, 2100000] },
  ],
  cylinderBores: [20, 25, 32, 40, 50, 63, 80, 100, 125, 160],
  cylinder: (bore, stroke) => {
    const b = 40000 + bore * 2200 + stroke * (40 + bore * 1.2);
    return [Math.round(b * 0.8), Math.round(b), Math.round(b * 1.6)];
  },
  indexer: [
    { model: '캠 인덱서 70형', torqueNm: 30, price: [1400000, 1900000, 2800000] },
    { model: '캠 인덱서 100형', torqueNm: 80, price: [1900000, 2600000, 3800000] },
    { model: '캠 인덱서 125형', torqueNm: 200, price: [2600000, 3500000, 5200000] },
    { model: '캠 인덱서 160형', torqueNm: 450, price: [3600000, 4800000, 7200000] },
  ],
  ballScrew: (d, len) => { const b = 90000 + d * 3500 + len * (40 + d * 2); return [b * 0.75, b, b * 1.7].map(Math.round); },
  lmGuide: (len) => { const b = 60000 + len * 95; return [b * 0.7, b, b * 1.6].map(Math.round); },
  belt: (w, len) => { const b = 50000 + (w * len) / 1e6 * 90000; return [b * 0.8, b, b * 1.5].map(Math.round); },
  gripper: [90000, 180000, 380000],
  linearActuator: (stroke) => { const b = 450000 + stroke * 450; return [b * 0.75, b, b * 1.6].map(Math.round); },
  levelingFoot: [6000, 9000, 18000],
  control: [
    { name: '스위치 + 인버터/속도제어기 단순 제어반', price: 450000 },
    { name: '소형 PLC + 조작반 (LS/미쓰비시급)', price: 1900000 },
    { name: 'PLC + 7" HMI + 안전릴레이·라이트커튼', price: 4800000 },
  ],
};

export const GEAR_RATIOS = [3, 3.6, 5, 6, 7.5, 9, 10, 12.5, 15, 18, 20, 25, 30, 36, 50, 60, 75, 90, 100, 120, 150, 180];
export const nearestRatio = (r) => GEAR_RATIOS.reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a));

// 공통 질문 (모든 의뢰에 적용)
export const COMMON_QUESTIONS = [
  { id: 'env', q: '설치 장소와 환경은 어떻게 되나요? (실내/실외, 온도, 분진, 수분, 식품·클린룸 여부)' },
  { id: 'power', q: '사용 가능한 전원은? (단상 220V / 삼상 380V / 에어 0.5MPa 공급 여부)' },
  { id: 'qty', q: '제작 수량과 희망 납기는 언제인가요?' },
  { id: 'interface', q: '기존 설비와 연동이 필요한가요? (PLC 기종, 신호 방식, 설치 공간 제약)' },
  { id: 'safety', q: '필요한 안전·인증 규격이 있나요? (KCs, CE, 산업안전보건법 방호장치 등)' },
  { id: 'finish', q: '선호하는 색상·표면처리나 재질 제한이 있나요?' },
];

// 키워드 기반 설계 제안 규칙
export const SUGGEST_RULES = [
  { re: /식품|음식|제과|제약|의료|위생|클린룸/, text: '위생 환경 → 접촉부는 SUS304, 벨트는 식품용 PU(FDA) 적용을 권장합니다.', set: { frameMat: 'SUS304' } },
  { re: /야외|실외|옥외|해안|습기|수분|물/, text: '수분/옥외 환경 → SUS304 또는 용융아연도금, 모터 IP65 이상을 권장합니다.' },
  { re: /정밀|정확|반복정밀|위치결정|μm|미크론/, text: '고정밀 위치결정 → 볼스크류 C5 등급 + LM 가이드 + 서보모터 구성을 권장합니다.' },
  { re: /고속|빠르|사이클\s*타임|택트/, text: '고속 사이클 → 서보 구동 및 경량 알루미늄 구조로 관성을 줄이는 것을 권장합니다.' },
  { re: /무거|중량물|톤|\d{3,}\s*kg/, text: '중량물 → SS400 용접 구조 프레임과 구조 해석(처짐 L/1000 이내) 검토가 필요합니다.', set: { frameMat: 'SS400' } },
  { re: /소음|조용/, text: '저소음 요구 → 벨트 구동 / 헬리컬 감속기, 방진 패드 적용을 권장합니다.' },
  { re: /안전|작업자|손|끼임/, text: '작업자 안전 → 협착 위험부 커버, 비상정지, 라이트커튼 적용을 권장합니다 (산업안전보건기준 규칙).' },
  { re: /저렴|저가|싸게|최소\s*비용|가성비/, text: '비용 우선 → SS400 도장 프레임 + 기어드 모터 + 단순 제어로 원가를 낮출 수 있습니다.', set: { frameMat: 'SS400' } },
  { re: /이동|바퀴|캐스터|옮기/, text: '이동형 → 브레이크 캐스터 + 레벨링 풋 겸용 적용을 권장합니다.' },
];
