// 관리자 페이지 스모크 테스트: node tests/smoke.admin.cjs [baseUrl] [outDir]
const { chromium } = require('playwright');
(async () => {
  const base = process.argv[2] || 'http://localhost:8765/';
  const out = process.argv[3] || '.';
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Rev.1' : undefined));
  await page.goto(base + 'admin.html');
  await page.fill('#uid', 'nobody'); await page.fill('#pw', 'wrong'); await page.click('#loginForm button');
  console.log('wrong pw msg:', await page.textContent('#loginMsg'));
  // 실제 계정은 저장소에 두지 않음: ADMIN_ID / ADMIN_PW 환경변수로 로그인 검증, 없으면 세션 우회
  if (process.env.ADMIN_ID && process.env.ADMIN_PW) {
    await page.fill('#uid', process.env.ADMIN_ID); await page.fill('#pw', process.env.ADMIN_PW); await page.click('#loginForm button');
  } else { await page.evaluate(() => sessionStorage.setItem('mk_admin', '1')); await page.reload(); }
  await page.waitForSelector('.kpis');
  // 의뢰 JSON 불러오기 → 전환
  const req = { id: 'REQ-TEST-1', customer: { name: '홍길동', company: '테스트산업', phone: '010-1111-2222', email: 'test@example.com' }, request: { title: '베어링 압입 프레스', text: '베어링 압입용 프레스 1톤, 스트로크 80mm, 작업자 수동 투입', qty: 2 }, design: null, quote: { tier: 'mid', selected: 9000000 } };
  require('fs').writeFileSync(out + '/req.json', JSON.stringify(req));
  await page.goto(base + 'admin.html#/requests');
  await page.setInputFiles('#imp', out + '/req.json');
  await page.waitForSelector('[data-conv]');
  await page.click('[data-conv]');
  await page.waitForSelector('#tabBody');
  console.log('project:', (await page.textContent('.main h2')).trim());
  await page.screenshot({ path: out + '/admin_analysis.png', fullPage: true });
  for (const tab of ['quote', 'design', 'drawing', 'outsource', 'schedule']) {
    await page.click(`[data-tab="${tab}"]`);
    await page.waitForTimeout(tab === 'design' ? 1800 : 500);
    if (tab === 'quote') { await page.click('#fix'); await page.waitForTimeout(300); }
    if (tab === 'design') { await page.click('#share'); await page.waitForTimeout(400); console.log('share url len:', (await page.inputValue('#shareOut input')).length); }
    if (tab === 'outsource') { const b = await page.$$('[data-rfq]:not([disabled])'); if (b.length) { await b[0].click(); await page.waitForTimeout(300); } console.log('rfqs:', await page.$$eval('[data-st]', (e) => e.length)); }
    if (tab === 'schedule') { await page.click('#gen'); await page.waitForTimeout(300); }
    await page.screenshot({ path: `${out}/admin_${tab}.png`, fullPage: true });
  }
  // AI: custom JSON 적용
  const pid = await page.evaluate(() => location.hash.split('/')[2]);
  await page.goto(base + `admin.html#/ai/${pid}`);
  await page.waitForSelector('#prompt');
  console.log('prompt chars:', (await page.inputValue('#prompt')).length);
  const ans = 'AI 답변입니다.\n```json\n' + JSON.stringify({ type: 'custom', title: '간이 리프트', period: 3, parts: [
    { id: 'base', name: '베이스', shape: 'box', size: [400, 300, 20], pos: [0, 0, 10], mat: 'SS400', proc: 'milling', holes: [{ x: -170, y: -120, d: 9 }, { x: 170, y: 120, d: 9 }] },
    { id: 'col', name: '기둥', shape: 'cyl', d: 50, len: 500, axis: 'z', pos: [0, -100, 270], mat: 'S45C', proc: 'lathe' },
    { id: 'tbl', name: '테이블', shape: 'box', size: [300, 200, 15], pos: [0, 30, 100], mat: 'AL6061', proc: 'milling', motion: [{ kind: 'kf', axis: [0, 0, 1], keys: [[0, 0], [0.5, 300], [1, 0]] }] },
    { id: 'motor', name: '모터', shape: 'cyl', d: 60, len: 100, axis: 'z', pos: [0, -100, 570], std: true, spec: '서보 200W', price: [1, 2, 3] }] }) + '\n```';
  await page.fill('#answer', ans);
  await page.click('#apply');
  console.log('apply:', (await page.textContent('#applyOut')).replace(/\s+/g, ' '));
  await page.goto(base + `admin.html#/project/${pid}/design`);
  await page.waitForTimeout(1500);
  console.log('custom verify:', (await page.textContent('.dp-verify')).replace(/\s+/g, ' ').slice(0, 160));
  await page.screenshot({ path: out + '/admin_custom.png' });
  await page.goto(base + `admin.html#/project/${pid}/drawing`);
  await page.waitForTimeout(500);
  console.log('drawings:', await page.$$eval('#dl li', (e) => e.length));
  for (const v of ['dashboard', 'schedule', 'vendors', 'settings']) { await page.goto(base + `admin.html#/${v}`); await page.waitForTimeout(300); }
  await page.goto(base + 'admin.html#/dashboard'); await page.waitForTimeout(300);
  await page.screenshot({ path: out + '/admin_dashboard.png', fullPage: true });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
