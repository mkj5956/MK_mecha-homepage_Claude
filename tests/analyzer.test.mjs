// node tests/analyzer.test.mjs
import { analyze } from '../js/analyzer.js';
const cases = [
  ['식품 공장에서 박스를 이송하는 컨베이어가 필요합니다. 길이 3m, 벨트폭 500mm, 높이 750, 속도 20m/min, 하중 50kg. 2대, 예산 2000만원, 6주 이내', 'conveyor', { length: 3000, width: 500, height: 750, speed: 20, load: 50, frameMat: 'SUS304' }],
  ['부품을 집어서 옆 라인으로 옮겨주는 자동화 장치. 이송거리 800, 상하 120mm, 사이클 3초, 무게 1.5kg', 'pickplace', { strokeX: 800, strokeZ: 120, cycle: 3, payload: 1.5 }],
  ['베어링 압입용 프레스 2톤, 스트로크 80', 'press', { force: 2000, stroke: 80 }],
  ['작업대 1800x800x900 하중 300kg', 'frame', { length: 1800, width: 800, height: 900, load: 300 }],
  ['100kg 제품을 상하로 올리는 리프트, 스트로크 700mm, 정밀 위치결정', 'lift', { stroke: 700, load: 100 }],
  ['6분할 회전 인덱스 테이블 직경 800', 'rotary', { diameter: 800 }],
];
let fail = 0;
for (const [text, type, expect] of cases) {
  const r = analyze(text);
  const errs = [];
  if (r.type !== type) errs.push(`type ${r.type}≠${type}`);
  for (const [k, v] of Object.entries(expect)) if (r.params[k] !== v) errs.push(`${k}=${r.params[k]}≠${v}`);
  console.log(errs.length ? '✗' : '✓', type, JSON.stringify(r.params), JSON.stringify(r.meta), errs.join(', '));
  if (errs.length) fail++;
}
process.exit(fail ? 1 : 0);
