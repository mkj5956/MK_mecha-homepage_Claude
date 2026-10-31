// 고객 페이지 스모크 테스트: node tests/smoke.customer.cjs [baseUrl] [outDir]
const { chromium } = require('playwright');
(async () => {
  const base = process.argv[2] || 'http://localhost:8765/';
  const out = process.argv[3] || '.';
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(base + 'index.html');
  await page.fill('#title', '박스 이송 컨베이어');
  await page.fill('#desc', '식품 공장 박스 이송. 길이 3m, 벨트폭 500mm, 높이 750, 속도 20m/min, 하중 50kg. 2대');
  await page.click('#analyzeBtn');
  await page.waitForSelector('#panel canvas');
  await page.waitForTimeout(1500);
  console.log('type:', await page.textContent('#typeResult'));
  console.log('verify:', (await page.textContent('.dp-verify')).replace(/\s+/g, ' ').slice(0, 300));
  console.log('tiers:', (await page.$$eval('#tiers .price', (e) => e.map((x) => x.textContent))).join(' / '));
  await page.locator('#concept').screenshot({ path: out + '/customer_concept.png' });
  // 유형 변경 → 프레스
  await page.selectOption('.dp-type', 'pickplace');
  await page.waitForTimeout(1200);
  await page.locator('#concept').screenshot({ path: out + '/customer_pickplace.png' });
  await page.fill('.dp-params input[type=number][data-k="strokeX"]', '1200');
  await page.dispatchEvent('.dp-params input[type=number][data-k="strokeX"]', 'change');
  await page.waitForTimeout(500);
  console.log('verify2:', (await page.textContent('.dp-verify')).replace(/\s+/g, ' ').slice(0, 200));
  await page.screenshot({ path: out + '/customer_full.png', fullPage: true });
  // 모바일
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
  m.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message));
  await m.goto(base + 'index.html');
  await m.fill('#desc', '프레스 1톤 스트로크 100');
  await m.click('#analyzeBtn');
  await m.waitForTimeout(1500);
  const sw = await m.evaluate(() => document.documentElement.scrollWidth);
  console.log('mobile scrollWidth', sw);
  await m.locator('#concept').screenshot({ path: out + '/customer_mobile.png' });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
