// =============================================================
//  데이터 저장소
//  - 관리자 데이터: 브라우저 localStorage (JSON 백업/복원 지원) → 서버·DB 비용 0원
//  - 고객 의뢰 접수: Google Apps Script 웹앱(무료) → 구글 시트 + 드라이브 + 이메일 알림
// =============================================================
import { CONFIG } from './config.js';

const KEY = 'mk_mecha_admin_db_v1';

const SAMPLE_VENDORS = [
  { id: 'v1', name: '(예시) 정밀가공 A사', contact: '김부장', email: 'vendor-a@example.com', phone: '031-000-0001', region: '경기 시흥', processes: ['milling', 'lathe', 'grind'], materials: ['AL6061', 'S45C', 'SS400', 'SUS304', 'POM', 'MCNYLON'], rating: 4.5, leadDays: 7, notes: '소량 정밀가공, MCT 5대' },
  { id: 'v2', name: '(예시) 제관판금 B사', contact: '이과장', email: 'vendor-b@example.com', phone: '032-000-0002', region: '인천 남동', processes: ['sheet', 'weld'], materials: ['SS400', 'SUS304', 'AL5052'], rating: 4.2, leadDays: 10, notes: '레이저 4kW, 절곡기, 분체도장 연계' },
  { id: 'v3', name: '(예시) 프로파일 C사', contact: '박대리', email: 'vendor-c@example.com', phone: '02-000-0003', region: '서울 구로', processes: ['profile'], materials: ['AL6061'], rating: 4.0, leadDays: 4, notes: '알루미늄 프로파일 절단·탭·조립' },
  { id: 'v4', name: '(예시) 표면처리 D사', contact: '최실장', email: 'vendor-d@example.com', phone: '031-000-0004', region: '경기 안산', processes: ['finish'], materials: ['AL6061', 'AL5052', 'SS400', 'S45C'], rating: 4.3, leadDays: 3, notes: '아노다이징, 무전해니켈, 분체도장' },
  { id: 'v5', name: '(예시) 자동화부품 E상사', contact: '정과장', email: 'vendor-e@example.com', phone: '02-000-0005', region: '서울 금천', processes: ['std'], materials: [], rating: 4.4, leadDays: 5, notes: '모터·LM가이드·볼스크류·공압 부품 대리점' },
];

function blank() {
  return { version: 1, projects: [], vendors: SAMPLE_VENDORS, requests: [], settings: { designer: CONFIG.ownerName, rates: {}, seq: 0, appsScriptUrl: CONFIG.appsScriptUrl, adminToken: '' } };
}

export const db = {
  data: null,
  load() {
    try { this.data = JSON.parse(localStorage.getItem(KEY)) || blank(); } catch { this.data = blank(); }
    const b = blank();
    for (const k of Object.keys(b)) if (this.data[k] === undefined) this.data[k] = b[k];
    this.data.settings = { ...b.settings, ...this.data.settings };
    return this.data;
  },
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); return true; }
    catch (e) { alert('브라우저 저장공간이 부족합니다. 설정 > 백업 후 오래된 프로젝트를 정리하세요.\n' + e.message); return false; }
  },
  nextNo() {
    const y = new Date().getFullYear();
    this.data.settings.seq = (this.data.settings.seq || 0) + 1;
    return `MK-${y}-${String(this.data.settings.seq).padStart(3, '0')}`;
  },
  exportJSON() { return JSON.stringify(this.data, null, 2); },
  importJSON(text) {
    const d = JSON.parse(text);
    if (!d || !Array.isArray(d.projects)) throw new Error('올바른 백업 파일이 아닙니다.');
    localStorage.setItem(KEY, JSON.stringify(d));
    this.load();
  },
};

// ---------------- Apps Script 통신 ----------------
function endpoint() { return (db.data?.settings?.appsScriptUrl) || CONFIG.appsScriptUrl; }

async function post(payload, url = endpoint()) {
  if (!url) throw new Error('Apps Script URL이 설정되지 않았습니다.');
  // text/plain 으로 보내 CORS preflight 회피 (Apps Script 권장 방식)
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), redirect: 'follow' });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || '서버 오류');
  return json;
}

export const remote = {
  hasEndpoint: () => !!(CONFIG.appsScriptUrl || db.data?.settings?.appsScriptUrl),
  submitRequest: (data) => post({ action: 'submit', data }, CONFIG.appsScriptUrl),
  list: () => post({ action: 'list', token: db.data.settings.adminToken }),
  update: (id, patch) => post({ action: 'update', token: db.data.settings.adminToken, id, patch }),
  ping: () => post({ action: 'ping', token: db.data.settings.adminToken }),
};
