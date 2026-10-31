// =============================================================
//  파라메트릭 설계 템플릿
//  각 템플릿: params(치수/사양) → build() 로 부품 목록 생성 → checks() 로 공학 검증
//  좌표계: mm, Z-up, 원점 = 바닥 중앙.  pos = 부품 중심.
//  부품 속성:
//    shape 'box'(size[x,y,z]) | 'cyl'(d, len, axis 'x'|'y'|'z')
//    pn   : 도면/BOM 그룹 키 (같은 pn = 같은 도면, 수량 합산)
//    mat  : 재질 키 (kb.MATERIALS),  proc : 가공 공정 키 (kb.PROCESSES)
//    std  : true 면 구매품 (spec, price[3])
//    holes: [{x,y,d}] 상면(Z) 관통 구멍, 부품 중심 기준
//    motion: [{kind:'kf'|'loop'|'rot'|'spin', ...}], follow: 다른 부품 id
//    ignore: 충돌 검사 제외 대상 id/pn,  role: 'work'(이송물) 등
// =============================================================
import { CATALOG, MATERIALS, nearestRatio } from './kb.js';

const box = (id, name, size, pos, o = {}) => ({ id, pn: id, name, shape: 'box', size, pos, ...o });
const cyl = (id, name, d, len, axis, pos, o = {}) => ({ id, pn: id, name, shape: 'cyl', d, len, axis, pos, ...o });
const holes4 = (sx, sy, inset, d) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({ x: a * (sx / 2 - inset), y: b * (sy / 2 - inset), d }));
const procOf = (mat) => (mat === 'AL6061' ? 'profile' : 'weld');
const r0 = (v) => Math.round(v);
const G = 9.81;

const MAT_SELECT = { key: 'frameMat', label: '프레임 재질', type: 'select', options: ['AL6061', 'SS400', 'SUS304'], def: 'AL6061' };

function check(item, value, limit, ok, note = '') { return { item, value, limit, ok, note }; }
function pickMotor(list, need, key = 'w') { return list.find((m) => m[key] >= need) || null; }

// 사각 관/프로파일 단면 2차 모멘트 (mm^4) - 외경 b×h, 두께 t
const Irect = (b, h, t) => (b * h ** 3 - (b - 2 * t) * (h - 2 * t) ** 3) / 12;

export const TEMPLATES = {
  // -----------------------------------------------------------
  conveyor: {
    key: 'conveyor', name: '벨트 컨베이어', automated: true, designHours: 24,
    keywords: ['컨베이어', 'conveyor', '벨트', '이송', '반송', '물류', '운반', '라인', '투입', '배출'],
    params: [
      { key: 'length', label: '전장(길이)', unit: 'mm', min: 500, max: 6000, step: 50, def: 1500, alias: ['길이', '전장', '전체길이', 'length'] },
      { key: 'width', label: '벨트 폭', unit: 'mm', min: 100, max: 1200, step: 10, def: 400, alias: ['벨트폭', '폭', '너비', 'width'] },
      { key: 'height', label: '벨트 상면 높이', unit: 'mm', min: 300, max: 1500, step: 10, def: 800, alias: ['높이', '작업높이', 'height'] },
      { key: 'speed', label: '이송 속도', unit: 'm/min', min: 1, max: 60, step: 1, def: 15, alias: ['속도', '이송속도', 'speed'] },
      { key: 'load', label: '총 적재 하중', unit: 'kg', min: 1, max: 500, step: 1, def: 30, alias: ['하중', '무게', '중량', '적재', 'load'] },
      MAT_SELECT,
    ],
    questions: [
      { id: 'c1', q: '이송물의 크기(가로×세로×높이)와 개당 무게는 얼마인가요?' },
      { id: 'c2', q: '연속 운전인가요, 정지-이동을 반복하는 간헐 운전인가요?' },
      { id: 'c3', q: '벨트 재질 요구사항이 있나요? (일반 PVC / 식품용 PU / 내열 / 정전기 방지)' },
      { id: 'c4', q: '속도 가변(인버터)이나 센서(제품 감지, 정지 위치) 기능이 필요한가요?' },
    ],
    build(p) {
      const L = p.length, W = p.width, H = p.height, mat = p.frameMat;
      const rd = W > 600 ? 89 : 60, Lc = L - rd - 20, zr = H - rd / 2, fy = W / 2 + 30;
      const v = (p.speed * 1000) / 60; // mm/s
      const wb = Math.min(200, W * 0.6), wh = Math.min(150, wb * 0.7);
      const period = Math.max(1, (Lc - wb) / v);
      const parts = [];
      for (const s of [-1, 1]) parts.push(box('frame' + (s < 0 ? 'L' : 'R'), '사이드 프레임', [L, 40, 80], [0, s * fy, zr], { pn: 'frame', mat, proc: mat === 'AL6061' ? 'profile' : 'sheet', structural: true, hollow: 0.3 }));
      const turns = (Lc - wb) / (Math.PI * rd);
      parts.push(cyl('roller_d', '구동 롤러', rd, W + 16, 'y', [Lc / 2, 0, zr], { mat: 'S45C', proc: 'lathe', motion: [{ kind: 'spin', axis: 'y', turns }], ignore: ['belt_top', 'belt_bot', 'bed', 'frame'] }));
      parts.push(cyl('roller_i', '종동 롤러', rd, W + 16, 'y', [-Lc / 2, 0, zr], { mat: 'S45C', proc: 'lathe', motion: [{ kind: 'spin', axis: 'y', turns }], ignore: ['belt_top', 'belt_bot', 'bed', 'frame'] }));
      const beltLen = r0(2 * Lc + Math.PI * rd);
      parts.push(box('belt_top', '컨베이어 벨트', [Lc, W, 3], [0, 0, H - 1.5], { std: true, spec: `PVC 2PLY 폭${W} × 무한 ${beltLen}mm`, price: CATALOG.belt(W, beltLen), color: 0x23272e }));
      parts.push(box('belt_bot', '컨베이어 벨트(하부)', [Lc, W, 3], [0, 0, H - rd + 1.5], { pn: 'belt_top', std: true, bomSkip: true, color: 0x23272e }));
      parts.push(box('bed', '슬라이더 베드', [Lc - rd - 20, W, 8], [0, 0, H - 7], { mat: 'SUS304', proc: 'sheet', ignore: ['belt_top'] }));
      const hl = zr - 40;
      const legXs = L > 2500 ? [-(L / 2 - 100), 0, L / 2 - 100] : [-(L / 2 - 100), L / 2 - 100];
      let i = 0;
      for (const x of legXs) for (const s of [-1, 1]) parts.push(box('leg' + ++i, '다리', [40, 40, hl], [x, s * fy, hl / 2], { pn: 'leg', mat, proc: procOf(mat), structural: true, hollow: 0.3 }));
      legXs.forEach((x, k) => parts.push(box('brace' + k, '하부 보강대', [40, 2 * fy - 40, 40], [x, 0, 150], { pn: 'brace', mat, proc: procOf(mat), structural: true, hollow: 0.3 })));
      parts.push({ id: 'foot', pn: 'foot', name: '레벨링 풋', bomOnly: true, qty: legXs.length * 2, std: true, spec: 'M12 × 100L 레벨링 풋', price: CATALOG.levelingFoot });
      // 동력 계산 → 모터 선정
      const res = this.calc(p);
      const motor = res.motor || CATALOG.gearMotor.at(-1);
      parts.push(box('gearbox', '감속기', [100, 50, 110], [Lc / 2, -(fy + 45), zr], { pn: 'motor', std: true, bomSkip: true, color: 0x39414c }));
      parts.push(cyl('motor', '기어드 모터', 90, 140, 'y', [Lc / 2, -(fy + 140), zr], { std: true, spec: `기어드 인덕션 모터 ${motor.w}W, 감속비 1/${res.ratio}`, price: motor.price, color: 0x2f3640 }));
      const n = Math.max(2, Math.floor(Lc / (wb * 2.5)));
      for (let k = 0; k < n; k++) parts.push(box('work' + k, '이송물(예시)', [wb, wb * 0.8, wh], [0, 0, H + wh / 2], { pn: 'work', role: 'work', group: 'work', bomSkip: true, motion: [{ kind: 'loop', dir: [1, 0, 0], from: -Lc / 2 + wb / 2, to: Lc / 2 - wb / 2, phase: k / n }], ignore: ['belt_top'] }));
      return { parts, period };
    },
    calc(p) {
      const v = p.speed / 60, rd = p.width > 600 ? 89 : 60, Lc = p.length - rd - 20;
      const beltMass = (p.width / 1000) * ((2 * Lc) / 1000) * 2.5;
      const m = p.load + beltMass, mu = 0.35, eta = 0.75;
      const P = (mu * m * G * v) / eta, need = P * 2;
      const motor = pickMotor(CATALOG.gearMotor, need);
      const rollerRpm = (v * 60) / (Math.PI * rd / 1000);
      const ratio = nearestRatio(1700 / rollerRpm);
      return { P, need, motor, rollerRpm, ratio, m };
    },
    checks(p) {
      const c = this.calc(p), out = [];
      out.push(check('소요 동력 (안전율 2 포함)', `${c.need.toFixed(1)} W`, c.motor ? `선정 ${c.motor.w} W` : '카탈로그 초과', !!c.motor, c.motor ? '' : '750W 초과 — 체인 구동/분할 컨베이어 검토 필요'));
      out.push(check('롤러 회전수 / 감속비', `${c.rollerRpm.toFixed(1)} rpm`, `1/${c.ratio}`, true, '4P 모터 1700rpm 기준'));
      const span = p.length > 2500 ? p.length / 2 - 100 : p.length - 200;
      const mat = MATERIALS[p.frameMat], I = Irect(40, 80, 3);
      const w = (c.m * G) / 2 / span; // 한쪽 프레임 분담 등분포 하중 N/mm
      const d = (5 * w * span ** 4) / (384 * mat.E * I);
      out.push(check('프레임 처짐 (등분포)', `${d.toFixed(2)} mm`, `≤ ${(span / 1000).toFixed(2)} mm (L/1000)`, d <= span / 1000));
      if (p.speed > 40) out.push(check('이송 속도', `${p.speed} m/min`, '≤ 40 권장', false, '고속 시 제품 미끄럼·사행 주의'));
      return out;
    },
  },

  // -----------------------------------------------------------
  lift: {
    key: 'lift', name: '수직 승강 장치 (볼스크류 리프트)', automated: true, designHours: 32,
    keywords: ['리프트', '승강', '엘리베이터', '상하', '높이조절', '업다운', 'lift', '수직', '올리', '내리', 'z축', '볼스크류'],
    params: [
      { key: 'stroke', label: '승강 스트로크', unit: 'mm', min: 100, max: 1500, step: 10, def: 500, alias: ['스트로크', '행정', '승강높이', 'stroke'] },
      { key: 'table', label: '테이블 크기(정사각)', unit: 'mm', min: 200, max: 800, step: 10, def: 400, alias: ['테이블', '테이블크기', '폭', 'table'] },
      { key: 'load', label: '최대 하중', unit: 'kg', min: 1, max: 300, step: 1, def: 50, alias: ['하중', '무게', '중량', '가반', 'load'] },
      { key: 'speed', label: '승강 속도', unit: 'mm/s', min: 10, max: 500, step: 5, def: 100, alias: ['속도', 'speed'] },
      { key: 'lead', label: '볼스크류 리드', type: 'select', options: [5, 10, 20], def: 10, unit: 'mm' },
      MAT_SELECT,
    ],
    questions: [
      { id: 'l1', q: '정지 위치는 몇 군데인가요? (상/하 2점, 다점 위치결정)' },
      { id: 'l2', q: '정전 시 낙하 방지(브레이크) 및 위치 정밀도 요구가 있나요?' },
      { id: 'l3', q: '하중이 테이블 중앙에 실리나요, 편심(한쪽으로 치우침)이 있나요?' },
    ],
    build(p) {
      const S = p.stroke, T = p.table, mat = p.frameMat, lead = +p.lead;
      const BY = T + 150, BX = T + 100, Hc = S + 260, y0 = -BY / 2;
      const res = this.calc(p), motor = res.motor || CATALOG.servo.at(-1);
      const period = (S / p.speed) / 0.4;
      const keys = [[0, 0], [0.4, S], [0.5, S], [0.9, 0], [1, 0]];
      const parts = [
        box('base', '베이스 플레이트', [BX, BY, 20], [0, 0, 10], { mat: mat === 'AL6061' ? 'AL6061' : 'SS400', proc: 'milling', holes: holes4(BX, BY, 30, 11), structural: true }),
        box('upright', '수직 플레이트', [T, 25, Hc], [0, y0 + 12.5, 20 + Hc / 2], { mat: mat === 'AL6061' ? 'AL6061' : 'SS400', proc: 'milling', structural: true }),
        box('top', '상부 플레이트', [T, 120, 20], [0, y0 + 60, 30 + Hc], { mat: 'AL6061', proc: 'milling', holes: [{ x: 0, y: 0, d: 22 }, ...holes4(T, 120, 25, 6.6)] }),
        box('railL', 'LM 가이드', [20, 15, Hc], [-(T / 2 - 40), y0 + 32.5, 20 + Hc / 2], { pn: 'rail', std: true, spec: `LM 가이드 15형 레일 L${Hc} + 블록 2EA`, price: CATALOG.lmGuide(Hc), color: 0x50565f }),
        box('railR', 'LM 가이드', [20, 15, Hc], [T / 2 - 40, y0 + 32.5, 20 + Hc / 2], { pn: 'rail', std: true, color: 0x50565f }),
        cyl('screw', '볼스크류', 20, Hc, 'z', [0, y0 + 60, 20 + Hc / 2], { std: true, spec: `볼스크류 Ø20 리드${lead} L${Hc} (C7) + 서포트 유닛`, price: CATALOG.ballScrew(20, Hc), color: 0x8c949e, motion: [{ kind: 'rot', axis: 'z', keys: keys.map(([t, v]) => [t, (v / lead) * 360 / 12]) }] }),
        box('carriage', '캐리지 플레이트', [T - 20, 40, 150], [0, y0 + 60, 135], { mat: 'AL6061', proc: 'milling', motion: [{ kind: 'kf', axis: [0, 0, 1], keys }], ignore: ['screw', 'rail'] }),
        box('table', '승강 테이블', [T, T, 20], [0, y0 + 80 + T / 2, 70], { mat: 'AL6061', proc: 'milling', follow: 'carriage', holes: holes4(T, T, 40, 9) }),
        box('work', '적재물(예시)', [T * 0.6, T * 0.6, T * 0.4], [0, y0 + 80 + T / 2, 80 + T * 0.2], { role: 'work', bomSkip: true, follow: 'carriage' }),
        cyl('motor', 'AC 서보 모터', 60, 110, 'z', [0, y0 + 60, 40 + Hc + 55], { std: true, spec: `AC 서보 ${motor.w}W (브레이크 부착) + 커플링`, price: motor.price, color: 0x2f3640 }),
      ];
      return { parts, period };
    },
    calc(p) {
      const lead = +p.lead, eta = 0.9;
      const mMove = p.load + (p.table ** 2 * 20 + (p.table - 20) * 40 * 150) * 2.7e-6;
      const F = mMove * G;
      const Tload = (F * lead) / (2 * Math.PI * eta) / 1000; // Nm
      const need = Tload * 1.3 * 1.5;
      const rpm = (p.speed / lead) * 60;
      const motor = CATALOG.servo.find((m) => m.ratedNm >= need && m.maxRpm >= rpm) || null;
      const L = p.stroke + 260, dr = 16;
      const nc = (15.1e7 * dr) / L ** 2;
      return { mMove, F, Tload, need, rpm, motor, nc };
    },
    checks(p) {
      const c = this.calc(p), out = [];
      out.push(check('필요 토크 (가속 30% + 안전율 1.5)', `${c.need.toFixed(2)} N·m`, c.motor ? `서보 ${c.motor.w}W 정격 ${c.motor.ratedNm} N·m` : '카탈로그 초과', !!c.motor, c.motor ? '' : '리드 축소 또는 감속기 추가 필요'));
      out.push(check('모터 회전수', `${c.rpm.toFixed(0)} rpm`, '≤ 3000 rpm', c.rpm <= 3000, c.rpm > 3000 ? '리드를 키우세요' : ''));
      out.push(check('볼스크류 위험속도', `${c.rpm.toFixed(0)} rpm`, `≤ ${(c.nc * 0.8).toFixed(0)} rpm (0.8·Nc)`, c.rpm <= c.nc * 0.8));
      out.push(check('수직축 낙하 방지', '브레이크 모터', '필수', true, '정전 시 자중 낙하 방지 — 브레이크 부착 서보 적용'));
      return out;
    },
  },

  // -----------------------------------------------------------
  pickplace: {
    key: 'pickplace', name: '갠트리 픽앤플레이스 (X-Z 2축)', automated: true, designHours: 40,
    keywords: ['픽앤플레이스', '픽업', '피킹', '이재', '옮겨', '집어', '그리퍼', '로봇', '갠트리', 'pick', '로더', '언로더', '자동화'],
    params: [
      { key: 'strokeX', label: 'X축 이송 거리', unit: 'mm', min: 200, max: 2000, step: 10, def: 600, alias: ['x축', '이송거리', '가로', '수평', 'strokeX'] },
      { key: 'strokeZ', label: 'Z축 상하 거리', unit: 'mm', min: 50, max: 400, step: 5, def: 150, alias: ['z축', '상하', '승강', 'strokeZ'] },
      { key: 'height', label: '빔 높이', unit: 'mm', min: 600, max: 2000, step: 10, def: 1000, alias: ['높이', 'height'] },
      { key: 'payload', label: '가반 중량', unit: 'kg', min: 0.1, max: 20, step: 0.1, def: 2, alias: ['하중', '무게', '중량', '가반', 'payload'] },
      { key: 'cycle', label: '1 사이클 시간', unit: 's', min: 1, max: 20, step: 0.5, def: 4, alias: ['사이클', '택트', '사이클타임', 'cycle'] },
      MAT_SELECT,
    ],
    questions: [
      { id: 'p1', q: '집는 물체의 형상·크기·재질은? (흡착 패드 / 그리퍼 선택에 필요)' },
      { id: 'p2', q: '집는 위치와 놓는 위치가 고정인가요, 여러 위치(팔레타이징)인가요?' },
      { id: 'p3', q: 'Y축(앞뒤) 이동도 필요한가요?' },
    ],
    build(p) {
      const SX = p.strokeX, SZ = p.strokeZ, H = Math.max(p.height, 450 + SZ), mat = p.frameMat;
      const px = SX / 2 + 150, Tt = H - 310 - SZ;
      const xk = [[0, 0], [0.22, 0], [0.45, SX], [0.67, SX], [1, 0]];
      const zk = [[0, 0], [0.08, -SZ], [0.14, -SZ], [0.22, 0], [0.45, 0], [0.53, -SZ], [0.59, -SZ], [0.67, 0], [1, 0]];
      const c = this.calc(p);
      const parts = [
        box('postL', '기둥', [60, 60, H], [-px, 0, H / 2], { pn: 'post', mat, proc: procOf(mat), structural: true, hollow: 0.3 }),
        box('postR', '기둥', [60, 60, H], [px, 0, H / 2], { pn: 'post', mat, proc: procOf(mat), structural: true, hollow: 0.3 }),
        box('beam', 'X축 빔', [2 * px + 60, 60, 80], [0, 0, H + 40], { mat, proc: procOf(mat), structural: true, hollow: 0.3 }),
        box('railX', 'X축 리니어 액추에이터', [SX + 260, 20, 20], [0, 40, H + 40], { std: true, spec: `${c.xType} 스트로크 ${SX}`, price: CATALOG.linearActuator(SX), color: 0x50565f }),
        box('carX', 'X 캐리지', [120, 30, 120], [-SX / 2, 65, H + 40], { mat: 'AL6061', proc: 'milling', motion: [{ kind: 'kf', axis: [1, 0, 0], keys: xk }], ignore: ['railX'], holes: holes4(120, 120, 15, 5.5) }),
        box('zcol', 'Z축 슬라이드', [40, 30, 300], [-SX / 2, 95, H - 60], { std: true, spec: `${c.zType} 스트로크 ${SZ}`, price: CATALOG.linearActuator(SZ), follow: 'carX', motion: [{ kind: 'kf', axis: [0, 0, 1], keys: zk }], color: 0x50565f }),
        box('grip', '그리퍼', [80, 40, 50], [-SX / 2, 95, H - 235], { std: true, spec: '공압 평행 그리퍼 (보어 16)', price: CATALOG.gripper, follow: 'zcol', color: 0x2f3640 }),
        box('fingerL', '핑거', [10, 30, 50], [-SX / 2 - 25, 95, H - 285], { pn: 'finger', mat: 'AL6061', proc: 'milling', follow: 'grip' }),
        box('fingerR', '핑거', [10, 30, 50], [-SX / 2 + 25, 95, H - 285], { pn: 'finger', mat: 'AL6061', proc: 'milling', follow: 'grip' }),
        box('table', '작업 테이블 상판', [SX + 200, 300, 20], [0, 95, Tt - 10], { mat: 'AL6061', proc: 'milling', holes: holes4(SX + 200, 300, 20, 9) }),
        ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b], k) => box('tleg' + k, '테이블 다리', [40, 40, Tt - 20], [a * (SX / 2 + 80), 95 + b * 130, (Tt - 20) / 2], { pn: 'tleg', mat, proc: procOf(mat), structural: true, hollow: 0.3 })),
        box('work', '작업물(예시)', [40, 30, 40], [-SX / 2, 95, Tt + 20], { role: 'work', bomSkip: true, ignore: ['finger', 'grip'], motion: [
          { kind: 'kf', axis: [1, 0, 0], keys: [[0, 0], [0.22, 0], [0.45, SX], [0.995, SX], [1, 0]] },
          { kind: 'kf', axis: [0, 0, 1], keys: [[0, 0], [0.14, 0], [0.22, SZ], [0.45, SZ], [0.53, 0], [1, 0]] }] }),
      ];
      return { parts, period: p.cycle };
    },
    calc(p) {
      const tx = 0.23 * p.cycle, tz = 0.08 * p.cycle;
      const vx = (2 * p.strokeX) / tx, ax = (4 * p.strokeX) / tx ** 2;
      const vz = (2 * p.strokeZ) / tz, az = (4 * p.strokeZ) / tz ** 2;
      const mX = p.payload + 3.5, F = (mX * ax) / 1000 + mX * G * 0.1;
      const T = (F * 15) / 1000 * 2; // 풀리 반경 15mm, 안전율 2
      const motor = CATALOG.servo.find((m) => m.ratedNm >= T) || null;
      const xType = vx > 500 ? '타이밍벨트 구동 액추에이터' : '볼스크류 구동 액추에이터';
      const zType = p.payload <= 3 && p.strokeZ <= 200 ? '공압 가이드 실린더' : '서보 볼스크류 슬라이드';
      return { tx, tz, vx, ax, vz, az, T, motor, xType, zType };
    },
    checks(p) {
      const c = this.calc(p), out = [];
      out.push(check('X축 최고 속도 (삼각 프로파일)', `${c.vx.toFixed(0)} mm/s`, '≤ 2000 mm/s (벨트) / 500 (볼스크류)', c.vx <= 2000, c.xType));
      out.push(check('X축 가속도', `${(c.ax / 9810).toFixed(2)} G`, '≤ 1.0 G', c.ax / 9810 <= 1, c.ax / 9810 > 1 ? '사이클 시간 늘리기 권장' : ''));
      out.push(check('X축 서보 토크', `${c.T.toFixed(2)} N·m`, c.motor ? `서보 ${c.motor.w}W` : '초과', !!c.motor));
      out.push(check('Z축 속도', `${c.vz.toFixed(0)} mm/s`, '≤ 800 mm/s', c.vz <= 800, c.zType));
      return out;
    },
  },

  // -----------------------------------------------------------
  rotary: {
    key: 'rotary', name: '로터리 인덱스 테이블', automated: true, designHours: 30,
    keywords: ['인덱스', '회전', '로터리', '턴테이블', '분할', '원판', 'rotary', 'index', '회전테이블'],
    params: [
      { key: 'diameter', label: '테이블 직경', unit: 'mm', min: 400, max: 1500, step: 10, def: 600, alias: ['직경', '지름', '테이블', 'diameter'] },
      { key: 'height', label: '테이블 상면 높이', unit: 'mm', min: 500, max: 1200, step: 10, def: 800, alias: ['높이', 'height'] },
      { key: 'stations', label: '분할 수 (스테이션)', unit: '개', min: 2, max: 12, step: 1, def: 4, alias: ['분할수', '스테이션', '포지션'], post: ['분할', '스테이션', '포지션', '공정'] },
      { key: 'load', label: '스테이션당 하중', unit: 'kg', min: 0.5, max: 50, step: 0.5, def: 5, alias: ['하중', '무게', '중량'] },
      { key: 'indexTime', label: '분할 이동 시간', unit: 's', min: 0.3, max: 5, step: 0.1, def: 1, alias: ['이동시간', '인덱스시간'] },
    ],
    questions: [
      { id: 'r1', q: '각 스테이션에서 어떤 작업을 하나요? (조립, 검사, 용접 등 — 정지 시간 결정)' },
      { id: 'r2', q: '테이블 위 지그(고정구)도 함께 제작이 필요한가요?' },
      { id: 'r3', q: '정지 위치 정밀도 요구치가 있나요? (예: ±0.05°)' },
    ],
    build(p) {
      const D = p.diameter, H = p.height, N = p.stations;
      const keys = [];
      for (let k = 0; k < N; k++) { keys.push([k / N, (k * 360) / N]); keys.push([(k + 0.4) / N, ((k + 1) * 360) / N]); }
      keys.push([1, 360]);
      const period = (p.indexTime / 0.4) * N;
      const c = this.calc(p), idx = c.indexer || CATALOG.indexer.at(-1);
      const rot = (center) => [{ kind: 'rot', axis: 'z', center, keys }];
      const parts = [
        box('frame', '하부 프레임', [D + 100, D + 100, H - 180], [0, 0, (H - 180) / 2], { mat: 'SS400', proc: 'weld', structural: true, hollow: 0.06 }),
        box('plate', '상판', [D + 100, D + 100, 20], [0, 0, H - 170], { mat: 'SS400', proc: 'milling', holes: holes4(220, 220, 20, 11), structural: true }),
        box('indexer', '캠 인덱서', [220, 220, 110], [0, 0, H - 105], { std: true, spec: `${idx.model} ${N}분할`, price: idx.price, color: 0x39414c }),
        cyl('shaft', '출력 플랜지', 80, 25, 'z', [0, 0, H - 37.5], { mat: 'S45C', proc: 'lathe' }),
        cyl('table', '인덱스 테이블', D, 25, 'z', [0, 0, H - 12.5], { mat: 'AL6061', proc: 'milling', motion: rot([0, 0]), ignore: ['shaft'] }),
        box('motor', '구동 모터', [160, 90, 90], [110 + 80, 0, H - 105], { std: true, spec: '기어드 모터 200W + 인버터', price: CATALOG.gearMotor[5].price, color: 0x2f3640 }),
      ];
      const r = D * 0.34, fs = Math.min(90, D * 0.18);
      for (let k = 0; k < N; k++) {
        const a = (k * 2 * Math.PI) / N, x = r * Math.cos(a), y = r * Math.sin(a);
        parts.push(box('fix' + k, '지그 블록', [fs, fs, 50], [x, y, H + 25], { pn: 'fixture', mat: 'AL6061', proc: 'milling', motion: rot([0, 0]), holes: holes4(fs, fs, 15, 6.6), ignore: ['table'] }));
        parts.push(cyl('wk' + k, '작업물(예시)', 50, 40, 'z', [x, y, H + 70], { role: 'work', bomSkip: true, group: 'work', motion: rot([0, 0]), ignore: ['fixture'] }));
      }
      return { parts, period };
    },
    calc(p) {
      const R = p.diameter / 2, mt = Math.PI * R * R * 25 * 2.7e-6, r = p.diameter * 0.34 / 1000;
      const J = 0.5 * mt * (R / 1000) ** 2 + p.stations * (p.load + 1.1) * r * r; // kg·m²
      const th = (2 * Math.PI) / p.stations, alpha = (4 * th) / p.indexTime ** 2;
      const T = J * alpha * 1.5 + 2;
      const indexer = CATALOG.indexer.find((i) => i.torqueNm >= T) || null;
      return { J, alpha, T, indexer, mt };
    },
    checks(p) {
      const c = this.calc(p);
      return [
        check('관성 모멘트', `${c.J.toFixed(3)} kg·m²`, '-', true, `테이블 질량 ${c.mt.toFixed(1)} kg`),
        check('인덱서 출력축 필요 토크 (SF 1.5)', `${c.T.toFixed(1)} N·m`, c.indexer ? `${c.indexer.model} (${c.indexer.torqueNm} N·m)` : '카탈로그 초과', !!c.indexer),
        check('지그 배치 (테이블 내 수용)', `${(p.diameter * 0.34 + Math.min(90, p.diameter * 0.18) * 0.71).toFixed(0)} mm`, `≤ ${p.diameter / 2} mm`, p.diameter * 0.34 + Math.min(90, p.diameter * 0.18) * 0.71 <= p.diameter / 2),
      ];
    },
  },

  // -----------------------------------------------------------
  press: {
    key: 'press', name: '공압 프레스', automated: true, designHours: 28,
    keywords: ['프레스', '압입', '압착', '눌러', '찍', '펀칭', '성형', 'press', '가압', '코킹', '리벳'],
    params: [
      { key: 'force', label: '가압력', unit: 'kgf', min: 10, max: 3000, step: 10, def: 300, alias: ['가압력', '압력', '힘', '톤', 'force'] },
      { key: 'stroke', label: '스트로크', unit: 'mm', min: 20, max: 300, step: 5, def: 100, alias: ['스트로크', '행정', 'stroke'] },
      { key: 'die', label: '금형(다이) 크기', unit: 'mm', min: 100, max: 400, step: 10, def: 200, alias: ['금형', '다이', '작업물', 'die'] },
      { key: 'bed', label: '베드 높이', unit: 'mm', min: 500, max: 1000, step: 10, def: 800, alias: ['높이', '베드높이', 'height'] },
    ],
    questions: [
      { id: 'pr1', q: '가압 대상(작업물)의 재질·크기와 공정(압입/코킹/펀칭)은 무엇인가요?' },
      { id: 'pr2', q: '가압력·변위 모니터링(로드셀) 또는 불량 판정이 필요한가요?' },
      { id: 'pr3', q: '작업자가 직접 투입하나요? (양수 조작 버튼/라이트커튼 필요)' },
    ],
    build(p) {
      const S = p.stroke, W = p.die, Hb = p.bed;
      const c = this.calc(p), bore = c.bore || 160, rodD = Math.round(bore * 0.4);
      const ppx = W / 2 + 80, workTop = Hb + 60;
      const ramTop = workTop + S + 90, crownBot = ramTop + 40, crownTop = crownBot + 50, Hp = crownTop - Hb;
      const keys = [[0, 0], [0.35, -S], [0.55, -S], [0.9, 0], [1, 0]];
      const parts = [
        box('base', '하부 프레임', [2 * ppx + 120, 400, Hb - 40], [0, 0, (Hb - 40) / 2], { mat: 'SS400', proc: 'weld', structural: true, hollow: 0.06 }),
        box('bed', '베드 플레이트', [2 * ppx + 120, 400, 40], [0, 0, Hb - 20], { mat: 'SS400', proc: 'milling', holes: [{ x: -ppx, y: 0, d: 40 }, { x: ppx, y: 0, d: 40 }], structural: true }),
        cyl('postL', '가이드 포스트', 40, Hp, 'z', [-ppx, 0, Hb + Hp / 2], { pn: 'post', mat: 'S45C', proc: 'lathe' }),
        cyl('postR', '가이드 포스트', 40, Hp, 'z', [ppx, 0, Hb + Hp / 2], { pn: 'post', mat: 'S45C', proc: 'lathe' }),
        box('ldie', '하형 (다이)', [W, W, 50], [0, 0, Hb + 25], { mat: 'S45C', proc: 'milling', holes: holes4(W, W, 20, 9) }),
        box('work', '작업물(예시)', [W * 0.7, W * 0.7, 10], [0, 0, Hb + 55], { role: 'work', bomSkip: true, ignore: ['udie'] }),
        box('udie', '상형 (펀치)', [W, W, 50], [0, 0, workTop + S + 25], { mat: 'S45C', proc: 'milling', motion: [{ kind: 'kf', axis: [0, 0, 1], keys }], ignore: ['work'] }),
        box('ram', '램 플레이트', [2 * ppx + 80, 120, 40], [0, 0, workTop + S + 70], { mat: 'SS400', proc: 'milling', follow: 'udie', ignore: ['post'], holes: [{ x: -ppx, y: 0, d: 40 }, { x: ppx, y: 0, d: 40 }, { x: 0, y: 0, d: rodD + 2 }] }),
        box('crown', '상부 크라운', [2 * ppx + 80, 120, 50], [0, 0, crownBot + 25], { mat: 'SS400', proc: 'milling', ignore: ['post'], holes: [{ x: -ppx, y: 0, d: 40 }, { x: ppx, y: 0, d: 40 }, { x: 0, y: 0, d: rodD + 10 }] }),
        cyl('cyl', '공압 실린더', bore + 30, S + 80, 'z', [0, 0, crownTop + (S + 80) / 2], { std: true, spec: `공압 실린더 Ø${bore} × ST${S}`, price: CATALOG.cylinder(bore, S), color: 0x39414c }),
        cyl('rod', '피스톤 로드', rodD, 130 + S, 'z', [0, 0, ramTop + (130 + S) / 2], { pn: 'cyl', std: true, bomSkip: true, follow: 'udie', ignore: ['crown', 'cyl'], color: 0xb8c0c8 }),
      ];
      return { parts, period: 2.5 };
    },
    calc(p) {
      const F = p.force * G, A = F / (0.5 * 0.7);
      const Dreq = Math.sqrt((4 * A) / Math.PI);
      const bore = CATALOG.cylinderBores.find((b) => b >= Dreq) || null;
      const sigma = F / (2 * Math.PI * 20 * 20);
      return { F, Dreq, bore, sigma };
    },
    checks(p) {
      const c = this.calc(p);
      return [
        check('필요 실린더 내경 (0.5MPa, 부하율 70%)', `Ø${c.Dreq.toFixed(1)}`, c.bore ? `선정 Ø${c.bore}` : 'Ø160 초과', !!c.bore, c.bore ? '' : '유압/서보 프레스 검토 필요'),
        check('포스트 인장 응력', `${c.sigma.toFixed(1)} MPa`, `≤ ${(345 / 3).toFixed(0)} MPa (S45C, SF3)`, c.sigma <= 115),
        check('작업자 안전', '양수조작 + 라이트커튼', '필수', true, '산업안전보건기준에 관한 규칙 제103조 (프레스 방호장치)'),
      ];
    },
  },

  // -----------------------------------------------------------
  frame: {
    key: 'frame', name: '작업대 / 구조물 프레임', automated: false, designHours: 12,
    keywords: ['작업대', '테이블', '프레임', '구조물', '거치대', '받침', '선반', '랙', '지그', '대차', 'frame', '스탠드', '책상'],
    params: [
      { key: 'length', label: '가로(길이)', unit: 'mm', min: 300, max: 3000, step: 10, def: 1200, alias: ['가로', '길이', 'length'] },
      { key: 'width', label: '세로(깊이)', unit: 'mm', min: 300, max: 1500, step: 10, def: 700, alias: ['세로', '깊이', '폭', 'width'] },
      { key: 'height', label: '높이', unit: 'mm', min: 300, max: 2000, step: 10, def: 850, alias: ['높이', 'height'] },
      { key: 'load', label: '상판 하중', unit: 'kg', min: 10, max: 2000, step: 10, def: 200, alias: ['하중', '무게', '중량', 'load'] },
      { key: 'shelf', label: '하부 선반', type: 'select', options: ['있음', '없음'], def: '있음' },
      MAT_SELECT,
    ],
    questions: [
      { id: 'f1', q: '상판 위에서 어떤 작업을 하나요? (조립, 검사, 장비 거치 등)' },
      { id: 'f2', q: '이동이 필요한가요? (캐스터) / 바닥 고정인가요?' },
      { id: 'f3', q: '서랍, 콘센트, 조명, 공구걸이 등 부가 기능이 필요한가요?' },
    ],
    build(p) {
      const L = p.length, W = p.width, H = p.height, mat = p.frameMat, pp = 40;
      const proc = procOf(mat);
      const parts = [
        box('top', '상판', [L, W, 15], [0, 0, H - 7.5], { mat: mat === 'SUS304' ? 'SUS304' : 'AL5052', proc: 'sheet', holes: holes4(L, W, 20, 6.6) }),
      ];
      let i = 0;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) parts.push(box('leg' + ++i, '다리', [pp, pp, H - 15], [sx * (L / 2 - pp / 2), sy * (W / 2 - pp / 2), (H - 15) / 2], { pn: 'leg', mat, proc, structural: true, hollow: 0.3 }));
      for (const sy of [-1, 1]) parts.push(box('beamL' + sy, '상부 장변 빔', [L - 2 * pp, pp, 2 * pp], [0, sy * (W / 2 - pp / 2), H - 15 - pp], { pn: 'beamL', mat, proc, structural: true, hollow: 0.3 }));
      for (const sx of [-1, 1]) parts.push(box('beamS' + sx, '상부 단변 빔', [pp, W - 2 * pp, 2 * pp], [sx * (L / 2 - pp / 2), 0, H - 15 - pp], { pn: 'beamS', mat, proc, structural: true, hollow: 0.3 }));
      for (const sy of [-1, 1]) parts.push(box('lowL' + sy, '하부 장변 빔', [L - 2 * pp, pp, pp], [0, sy * (W / 2 - pp / 2), 200], { pn: 'lowL', mat, proc, structural: true, hollow: 0.3 }));
      if (p.shelf === '있음') parts.push(box('shelf', '하부 선반', [L - 2 * pp, W - 2 * pp, 10], [0, 0, 225], { mat: 'AL5052', proc: 'sheet' }));
      parts.push({ id: 'foot', pn: 'foot', name: '레벨링 풋', bomOnly: true, qty: 4, std: true, spec: 'M12 × 100L 레벨링 풋', price: CATALOG.levelingFoot });
      return { parts, period: 0 };
    },
    checks(p) {
      const span = p.length - 80, mat = MATERIALS[p.frameMat];
      const I = Irect(40, 80, mat.name.startsWith('AL') ? 4 : 2.3);
      const w = (p.load * G) / 2 / span;
      const d = (5 * w * span ** 4) / (384 * mat.E * I);
      const lim = span / 500;
      return [
        check('상부 장변 빔 처짐 (등분포)', `${d.toFixed(2)} mm`, `≤ ${lim.toFixed(2)} mm (L/500)`, d <= lim, d > lim ? '빔 단면 증가 또는 중간 지지 추가' : ''),
        check('다리 압축 하중', `${((p.load * G) / 4).toFixed(0)} N/개`, '여유', true),
      ];
    },
  },
};

// 사용자 정의(커스텀) 설계: AI(구독형 Claude/ChatGPT)가 생성한 JSON 부품 목록을 그대로 사용
export const CUSTOM = {
  key: 'custom', name: '사용자 정의 설계', automated: false, designHours: 30, params: [], questions: [],
  build(p, parts) { return { parts: (parts || []).map((x, i) => ({ pn: x.id || 'p' + i, ...x, id: x.id || 'p' + i })), period: (p && p.period) || 0 }; },
  checks() { return []; },
};

export function getTemplate(key) { return TEMPLATES[key] || CUSTOM; }

export function defaultParams(key) {
  const t = getTemplate(key), o = {};
  for (const pr of t.params) o[pr.key] = pr.def;
  return o;
}

export function clampParams(key, params) {
  const t = getTemplate(key), o = { ...defaultParams(key), ...params };
  for (const pr of t.params) {
    if (pr.type === 'select') { if (!pr.options.map(String).includes(String(o[pr.key]))) o[pr.key] = pr.def; continue; }
    let v = Number(o[pr.key]);
    if (!Number.isFinite(v)) v = pr.def;
    o[pr.key] = Math.min(pr.max, Math.max(pr.min, v));
  }
  return o;
}

/** design = {type, params, parts?(custom), title} → {parts, period, checks, template} */
export function buildDesign(design) {
  const t = getTemplate(design.type);
  const params = t === CUSTOM ? (design.params || {}) : clampParams(design.type, design.params);
  const { parts, period } = t.build(params, design.parts);
  const checks = t.checks(params);
  return { parts, period, checks, template: t, params };
}
