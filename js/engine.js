// =============================================================
//  운동 엔진 + 동적 간섭(충돌) 검증
//  - 부품 motion 정의로 임의 시각 t(0~1, 1주기)의 자세 계산
//  - OBB(방향성 경계 상자) SAT 판정으로 움직이는 부품과 다른 부품의 간섭 검사
// =============================================================

const smooth = (x) => x * x * (3 - 2 * x);

function kfValue(keys, t) {
  if (!keys || !keys.length) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    const [t0, v0] = keys[i - 1];
    if (t <= t1) return t1 === t0 ? v1 : v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0));
  }
  return keys.at(-1)[1];
}

const AX = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/** 부품 하나의 시각 t 자세: {offset:[x,y,z], rot:{axis, angle(rad), center}|null} */
export function ownPose(part, t) {
  const off = [0, 0, 0];
  let rot = null;
  for (const m of part.motion || []) {
    if (m.kind === 'kf') {
      const v = kfValue(m.keys, t);
      for (let i = 0; i < 3; i++) off[i] += m.axis[i] * v;
    } else if (m.kind === 'loop') {
      const f = (((t + (m.phase || 0)) % 1) + 1) % 1;
      const v = m.from + f * (m.to - m.from);
      for (let i = 0; i < 3; i++) off[i] += m.dir[i] * v;
    } else if (m.kind === 'spin') {
      rot = { axis: m.axis, angle: 2 * Math.PI * m.turns * t, center: null };
    } else if (m.kind === 'rot') {
      rot = { axis: m.axis, angle: (kfValue(m.keys, t) * Math.PI) / 180, center: m.center || null };
    }
  }
  return { offset: off, rot };
}

export function makeIndex(parts) {
  const map = new Map(parts.map((p) => [p.id, p]));
  return map;
}

/** follow 체인을 포함한 최종 평행이동 */
export function worldOffset(part, t, index, depth = 0) {
  const own = ownPose(part, t);
  if (part.follow && index.has(part.follow) && depth < 10) {
    const f = worldOffset(index.get(part.follow), t, index, depth + 1);
    return [own.offset[0] + f[0], own.offset[1] + f[1], own.offset[2] + f[2]];
  }
  return own.offset;
}

export function isMoving(part, index, depth = 0) {
  if (part.motion && part.motion.length) return true;
  if (part.follow && index.has(part.follow) && depth < 10) return isMoving(index.get(part.follow), index, depth + 1);
  return false;
}

function rootOf(part, index) {
  let p = part, n = 0;
  while (p.follow && index.has(p.follow) && n++ < 10) p = index.get(p.follow);
  return p.id;
}

function rotVec(v, axis, ang) {
  const [x, y, z] = v, c = Math.cos(ang), s = Math.sin(ang);
  if (axis === 'x') return [x, y * c - z * s, y * s + z * c];
  if (axis === 'y') return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}

/** 부품의 기본 반치수 (월드 축 기준, 회전 전) */
export function halfExtents(part) {
  if (part.shape === 'cyl') {
    const r = part.d / 2, h = part.len / 2;
    return part.axis === 'x' ? [h, r, r] : part.axis === 'y' ? [r, h, r] : [r, r, h];
  }
  return part.size.map((v) => v / 2);
}

/** 시각 t 의 OBB: {c, u:[3 axes], e:[3]} */
export function obbAt(part, t, index) {
  const off = worldOffset(part, t, index);
  const { rot } = ownPose(part, t);
  let c = [...part.pos];
  let u = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  if (rot && rot.angle) {
    const center = rot.center ? [rot.center[0], rot.center[1], part.pos[2]] : part.pos;
    // 원통이 자기 축으로 회전하는 경우 형상 불변
    const selfSpin = part.shape === 'cyl' && part.axis === rot.axis && !rot.center;
    if (!selfSpin) {
      const rel = [c[0] - center[0], c[1] - center[1], c[2] - center[2]];
      const r = rotVec(rel, rot.axis, rot.angle);
      c = [center[0] + r[0], center[1] + r[1], center[2] + r[2]];
      u = u.map((a) => rotVec(a, rot.axis, rot.angle));
    }
  }
  return { c: [c[0] + off[0], c[1] + off[1], c[2] + off[2]], u, e: halfExtents(part) };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** OBB-OBB 분리축 판정. 침투 깊이(최소 겹침)를 반환, 분리되면 0 */
export function obbOverlap(A, B) {
  const T = [B.c[0] - A.c[0], B.c[1] - A.c[1], B.c[2] - A.c[2]];
  const axes = [...A.u, ...B.u];
  for (const a of A.u) for (const b of B.u) {
    const cx = cross(a, b), l = Math.hypot(...cx);
    if (l > 1e-6) axes.push(cx.map((v) => v / l));
  }
  let minPen = Infinity;
  for (const L of axes) {
    const ra = A.e[0] * Math.abs(dot(A.u[0], L)) + A.e[1] * Math.abs(dot(A.u[1], L)) + A.e[2] * Math.abs(dot(A.u[2], L));
    const rb = B.e[0] * Math.abs(dot(B.u[0], L)) + B.e[1] * Math.abs(dot(B.u[1], L)) + B.e[2] * Math.abs(dot(B.u[2], L));
    const pen = ra + rb - Math.abs(dot(T, L));
    if (pen <= 0) return 0;
    minPen = Math.min(minPen, pen);
  }
  return minPen;
}

function ignored(a, b) {
  const ig = (x, y) => (x.ignore || []).some((k) => k === y.id || k === y.pn);
  return ig(a, b) || ig(b, a);
}

/**
 * 동적 간섭 검사: 1주기를 steps 등분하여 모든 시각에서 검사
 * @returns {collisions:[{a,b,t,depth}], checkedPairs, steps}
 */
export function checkCollisions(parts, { steps = 120, tol = 0.5 } = {}) {
  const geo = parts.filter((p) => p.shape && !p.bomOnly);
  const index = makeIndex(geo);
  const moving = new Set(geo.filter((p) => isMoving(p, index)).map((p) => p.id));
  const pairs = [];
  for (let i = 0; i < geo.length; i++) for (let j = i + 1; j < geo.length; j++) {
    const a = geo[i], b = geo[j];
    if (!moving.has(a.id) && !moving.has(b.id)) continue;
    if (a.group && a.group === b.group) continue;
    if (rootOf(a, index) === rootOf(b, index)) continue;
    if (ignored(a, b)) continue;
    pairs.push([a, b]);
  }
  const found = new Map();
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    for (const [a, b] of pairs) {
      const key = a.id + '|' + b.id;
      if (found.has(key)) continue;
      const d = obbOverlap(obbAt(a, t, index), obbAt(b, t, index));
      if (d > tol) found.set(key, { a: a.id, an: a.name, b: b.id, bn: b.name, t, depth: d });
    }
  }
  return { collisions: [...found.values()], checkedPairs: pairs.length, steps, movingCount: moving.size };
}

/** 전체 외곽 치수 (t=0) */
export function overallBox(parts) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    if (!p.shape || p.bomOnly) continue;
    const e = halfExtents(p);
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p.pos[i] - e[i]); max[i] = Math.max(max[i], p.pos[i] + e[i]); }
  }
  if (!Number.isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };
  return { min, max, size: max.map((v, i) => v - min[i]) };
}

/** 움직이는 부품의 행정 범위(최소/최대 위치) */
export function motionRanges(parts, steps = 60) {
  const geo = parts.filter((p) => p.shape);
  const index = makeIndex(geo);
  const out = [];
  for (const p of geo) {
    if (!p.motion || !p.motion.length || p.role === 'work') continue;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    let rotMax = 0;
    for (let s = 0; s <= steps; s++) {
      const o = worldOffset(p, s / steps, index);
      for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], o[i]); mx[i] = Math.max(mx[i], o[i]); }
      const r = ownPose(p, s / steps).rot;
      if (r) rotMax = Math.max(rotMax, Math.abs(r.angle));
    }
    out.push({ id: p.id, name: p.name, travel: mx.map((v, i) => v - mn[i]), rotDeg: (rotMax * 180) / Math.PI });
  }
  return out;
}
