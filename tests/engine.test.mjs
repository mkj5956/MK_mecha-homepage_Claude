// 엔진 자체 검증: node tests/engine.test.mjs
import { TEMPLATES, buildDesign, defaultParams } from '../js/templates.js';
import { checkCollisions, overallBox } from '../js/engine.js';
import { estimate, manwon } from '../js/estimator.js';
let fail = 0;
for (const key of Object.keys(TEMPLATES)) {
  for (const variant of ['min', 'def', 'max']) {
    const params = defaultParams(key);
    if (variant !== 'def') for (const p of TEMPLATES[key].params) if (p.type !== 'select') params[p.key] = p[variant];
    const b = buildDesign({ type: key, params });
    const c = checkCollisions(b.parts);
    const est = estimate(b);
    const box = overallBox(b.parts).size.map(Math.round).join('x');
    const bad = c.collisions.length;
    if (bad && variant === 'def') fail++;
    console.log(`${key.padEnd(10)} ${variant} parts=${b.parts.length} box=${box} moving=${c.movingCount} pairs=${c.checkedPairs} collisions=${bad} ${est.map(e => manwon(e.total)).join(' / ')}`);
    for (const x of c.collisions) console.log('   ⚠', x.an, '↔', x.bn, 't=', x.t.toFixed(2), 'depth', x.depth.toFixed(1));
    for (const ch of b.checks) if (!ch.ok) console.log('   ✗', ch.item, ch.value, ch.limit);
  }
}
// 의도적 충돌 감지 확인
const b = buildDesign({ type: 'lift', params: defaultParams('lift') });
b.parts.find(p => p.id === 'top').pos[2] -= 200;
const c = checkCollisions(b.parts);
if (!c.collisions.length) { console.log('FAIL: 의도적 충돌 미검출'); fail++; } else console.log('OK: 의도적 충돌 검출 →', c.collisions[0].an, '↔', c.collisions[0].bn);
process.exit(fail ? 1 : 0);
