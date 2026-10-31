/**
 * 범용 무료 백엔드 템플릿 (Google Apps Script)
 * 기능: submit(공개) / list·update·ping(관리자 토큰 필요)
 * 저장: 구글 시트(행) + 구글 드라이브(첨부) + Gmail 알림
 *
 * 스크립트 속성: ADMIN_EMAIL(알림 받을 메일) — 나머지는 setup()이 자동 생성
 * 필드를 바꿀 때는 HEADERS 와 submit() 의 row 만 수정.
 */
const SHEET_NAME = 'submissions';
const HEADERS = ['id', 'receivedAt', 'status', 'name', 'phone', 'email', 'summary', 'files', 'data'];
const TITLE = '홈페이지 접수';

function setup() {
  const P = PropertiesService.getScriptProperties();
  if (!P.getProperty('SHEET_ID')) {
    const ss = SpreadsheetApp.create(TITLE);
    const sh = ss.getSheets()[0]; sh.setName(SHEET_NAME); sh.appendRow(HEADERS); sh.setFrozenRows(1);
    P.setProperty('SHEET_ID', ss.getId());
  }
  if (!P.getProperty('FOLDER_ID')) P.setProperty('FOLDER_ID', DriveApp.createFolder(TITLE + ' 첨부').getId());
  if (!P.getProperty('ADMIN_TOKEN')) P.setProperty('ADMIN_TOKEN', Utilities.getUuid().replace(/-/g, ''));
  Logger.log('SHEET: https://docs.google.com/spreadsheets/d/' + P.getProperty('SHEET_ID'));
  Logger.log('ADMIN_TOKEN: ' + P.getProperty('ADMIN_TOKEN'));
}

function doGet() { return out({ ok: true }); }

function doPost(e) {
  try {
    const b = JSON.parse(e.postData.contents);
    if (b.action === 'submit') return out(submit(b.data));
    auth(b.token);
    if (b.action === 'list') return out(list());
    if (b.action === 'update') return out(update(b.id, b.patch || {}));
    if (b.action === 'ping') return out({ ok: true, count: sheet().getLastRow() - 1 });
    return out({ ok: false, error: 'unknown action' });
  } catch (err) { return out({ ok: false, error: String(err.message || err) }); }
}

const out = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
const prop = (k) => PropertiesService.getScriptProperties().getProperty(k);
const sheet = () => SpreadsheetApp.openById(prop('SHEET_ID')).getSheetByName(SHEET_NAME);
function auth(t) { if (!t || t !== prop('ADMIN_TOKEN')) throw new Error('인증 실패'); }
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function submit(d) {
  const c = (d && d.customer) || {};
  if (!c.name || !c.email) throw new Error('필수 항목 누락');
  const cache = CacheService.getScriptCache(), key = 's_' + String(c.email).toLowerCase();
  if (cache.get(key)) throw new Error('잠시 후 다시 시도해 주세요.');   // 1분 중복 차단
  cache.put(key, '1', 60);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const id = 'REQ-' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 900 + 100);
    let files = [];
    if ((d.files || []).length) {
      const folder = DriveApp.getFolderById(prop('FOLDER_ID')).createFolder(id + ' ' + c.name);
      files = d.files.slice(0, 8).map((f) => ({ name: f.name, url: folder.createFile(Utilities.newBlob(Utilities.base64Decode(f.data), f.type || 'application/octet-stream', f.name)).getUrl() }));
    }
    delete d.files;
    const summary = String(d.title || d.message || '').slice(0, 200);
    sheet().appendRow([id, new Date().toISOString(), '신규', c.name, c.phone || '', c.email, summary, JSON.stringify(files), JSON.stringify(d)]);
    const to = prop('ADMIN_EMAIL');
    if (to) MailApp.sendEmail({ to, replyTo: c.email, subject: `[${TITLE}] ${summary.slice(0, 40)} - ${c.name}`,
      htmlBody: `<h3>${id}</h3><p>${esc(c.name)} · ${esc(c.phone)} · ${esc(c.email)}</p><p>${esc(summary)}</p>` + files.map((f) => `<a href="${f.url}">${esc(f.name)}</a>`).join('<br>') });
    return { ok: true, id };
  } finally { lock.releaseLock(); }
}

function list() {
  const v = sheet().getDataRange().getValues(), h = v.shift(), i = (k) => h.indexOf(k);
  const parse = (s, d) => { try { return JSON.parse(s || d); } catch (e) { return JSON.parse(d); } };
  return { ok: true, rows: v.map((r) => ({ id: r[i('id')], receivedAt: r[i('receivedAt')], status: r[i('status')], files: parse(r[i('files')], '[]'), data: parse(r[i('data')], '{}') })).reverse().slice(0, 300) };
}

function update(id, patch) {
  const sh = sheet(), v = sh.getDataRange().getValues(), h = v[0];
  for (let r = 1; r < v.length; r++) if (v[r][0] === id) {
    Object.keys(patch).forEach((k) => { const c = h.indexOf(k); if (c > 0 && k !== 'data') sh.getRange(r + 1, c + 1).setValue(patch[k]); });
    return { ok: true };
  }
  throw new Error('not found');
}
