/**
 * MK Mecha — 설계 의뢰 접수 백엔드 (Google Apps Script, 무료)
 * 고객 의뢰 → 구글 시트 저장 + 첨부파일 구글 드라이브 저장 + 관리자 이메일 알림
 *
 * 설치: apps-script/README.md 참고
 * 스크립트 속성(프로젝트 설정 > 스크립트 속성):
 *   ADMIN_TOKEN  : 관리자 페이지 > 설정 의 "관리자 토큰"과 같은 임의의 긴 문자열
 *   ADMIN_EMAIL  : 새 의뢰 알림을 받을 이메일
 *   SHEET_ID     : (setup() 실행 시 자동 생성)
 *   FOLDER_ID    : (setup() 실행 시 자동 생성)
 */

const SHEET_NAME = 'requests';
const HEADERS = ['id', 'receivedAt', 'status', 'name', 'company', 'phone', 'email', 'title', 'quoteTier', 'quoteTotal', 'files', 'data', 'project'];

/** 최초 1회 실행: 시트·폴더 생성 */
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SHEET_ID')) {
    const ss = SpreadsheetApp.create('MK Mecha 설계 의뢰 접수');
    const sh = ss.getSheets()[0];
    sh.setName(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    props.setProperty('SHEET_ID', ss.getId());
  }
  if (!props.getProperty('FOLDER_ID')) {
    props.setProperty('FOLDER_ID', DriveApp.createFolder('MK Mecha 의뢰 첨부파일').getId());
  }
  if (!props.getProperty('ADMIN_TOKEN')) {
    props.setProperty('ADMIN_TOKEN', Utilities.getUuid().replace(/-/g, ''));
  }
  Logger.log('SHEET: https://docs.google.com/spreadsheets/d/' + props.getProperty('SHEET_ID'));
  Logger.log('ADMIN_TOKEN (관리자 페이지 설정에 입력): ' + props.getProperty('ADMIN_TOKEN'));
  Logger.log('ADMIN_EMAIL: ' + (props.getProperty('ADMIN_EMAIL') || '(미설정 — 스크립트 속성에 추가하세요)'));
}

function doGet() {
  return json({ ok: true, service: 'MK Mecha request API' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    switch (body.action) {
      case 'submit': return json(submit(body.data));
      case 'list': auth(body.token); return json(list());
      case 'update': auth(body.token); return json(update(body.id, body.patch || {}));
      case 'ping': auth(body.token); return json({ ok: true, count: sheet().getLastRow() - 1 });
      default: return json({ ok: false, error: 'unknown action' });
    }
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) });
  }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function prop(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function auth(token) { if (!token || token !== prop('ADMIN_TOKEN')) throw new Error('인증 실패: 관리자 토큰을 확인하세요.'); }
function sheet() { return SpreadsheetApp.openById(prop('SHEET_ID')).getSheetByName(SHEET_NAME); }

function submit(d) {
  if (!d || !d.customer || !d.customer.name || !d.customer.email) throw new Error('필수 항목 누락');
  // 간단한 남용 방지: 같은 이메일 1분 내 중복 접수 차단
  const cache = CacheService.getScriptCache();
  const key = 'sub_' + String(d.customer.email).toLowerCase();
  if (cache.get(key)) throw new Error('잠시 후 다시 시도해 주세요.');
  cache.put(key, '1', 60);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const id = 'REQ-' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 900 + 100);
    const folder = DriveApp.getFolderById(prop('FOLDER_ID')).createFolder(id + ' ' + d.customer.name);
    const files = (d.files || []).slice(0, 8).map(function (f) {
      const blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.type || 'application/octet-stream', f.name);
      const file = folder.createFile(blob);
      return { name: f.name, url: file.getUrl() };
    });
    delete d.files;
    const row = [id, new Date().toISOString(), '신규', d.customer.name, d.customer.company || '', d.customer.phone || '', d.customer.email,
      (d.request && d.request.title) || '', (d.quote && d.quote.tier) || '', (d.quote && d.quote.selected) || '',
      JSON.stringify(files), JSON.stringify(d), ''];
    sheet().appendRow(row);
    notify(id, d, files);
    return { ok: true, id: id };
  } finally {
    lock.releaseLock();
  }
}

function notify(id, d, files) {
  const to = prop('ADMIN_EMAIL');
  if (!to) return;
  const c = d.customer, r = d.request || {};
  const html = '<h2>새 설계 의뢰 ' + id + '</h2>' +
    '<p><b>' + esc(c.name) + '</b> ' + esc(c.company || '') + '<br>' + esc(c.phone || '') + ' · ' + esc(c.email) + ' (선호: ' + esc(c.contactPref || '') + ')</p>' +
    '<p><b>' + esc(r.title || '') + '</b><br>' + esc(r.text || '').replace(/\n/g, '<br>') + '</p>' +
    (d.ref ? '<p>기존 프로젝트 수정 요청: ' + esc(d.ref) + '</p>' : '') +
    (d.quote ? '<p>선택 견적: ' + esc(d.quote.tier) + ' / ' + Number(d.quote.selected || 0).toLocaleString() + '원</p>' : '') +
    '<p>첨부: ' + files.map(function (f) { return '<a href="' + f.url + '">' + esc(f.name) + '</a>'; }).join(', ') + '</p>' +
    '<p>관리자 페이지 > 의뢰함 > "서버에서 새 의뢰 가져오기"를 눌러 확인하세요.</p>';
  MailApp.sendEmail({ to: to, subject: '[설계 의뢰] ' + (r.title || id) + ' - ' + c.name, htmlBody: html, replyTo: c.email });
  // 고객 접수 확인 메일 (원치 않으면 아래 줄 삭제)
  MailApp.sendEmail({ to: c.email, subject: '[접수 완료] 설계 의뢰가 접수되었습니다 (' + id + ')', htmlBody: '<p>' + esc(c.name) + '님, 설계 의뢰가 정상 접수되었습니다.<br>접수번호: <b>' + id + '</b><br>담당 설계자가 검토 후 영업일 1~2일 내 연락드립니다.</p>', replyTo: to });
}

function list() {
  const sh = sheet(), values = sh.getDataRange().getValues();
  const head = values.shift();
  const idx = function (k) { return head.indexOf(k); };
  const rows = values.map(function (v) {
    let data = {}, files = [];
    try { data = JSON.parse(v[idx('data')] || '{}'); } catch (e) { /* ignore */ }
    try { files = JSON.parse(v[idx('files')] || '[]'); } catch (e) { /* ignore */ }
    return { id: v[idx('id')], receivedAt: v[idx('receivedAt')], status: v[idx('status')], data: data, files: files };
  }).reverse().slice(0, 200);
  return { ok: true, rows: rows };
}

function update(id, patch) {
  const sh = sheet(), values = sh.getDataRange().getValues(), head = values[0];
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      Object.keys(patch).forEach(function (k) { const c = head.indexOf(k); if (c >= 0 && k !== 'id' && k !== 'data') sh.getRange(i + 1, c + 1).setValue(patch[k]); });
      return { ok: true };
    }
  }
  throw new Error('not found');
}

function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
