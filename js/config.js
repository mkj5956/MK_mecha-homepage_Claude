// =============================================================
//  사이트 설정 — 이 파일만 수정하면 회사 정보/연락처가 바뀝니다.
// =============================================================
export const CONFIG = {
  company: 'MK Mecha',
  companyKo: 'MK 메카 기계설계',
  slogan: '아이디어만 주세요. 설계·견적·제작·납품까지 한 번에.',
  ownerName: '대표 설계자',
  // ▼ 고객이 연락할 정보 (반드시 본인 정보로 수정)
  email: 'your-email@example.com',
  phone: '010-0000-0000',
  kakao: '',            // 카카오톡 오픈채팅 링크(선택)
  address: '',          // 사업장 주소(선택)
  bizNo: '',            // 사업자등록번호(선택)

  // ▼ Google Apps Script 웹앱 URL (apps-script/README.md 참고).
  //   비워두면 의뢰서가 이메일(mailto)+JSON 파일 방식으로 전달됩니다.
  appsScriptUrl: '',

  // ▼ 관리자 페이지 비밀번호의 SHA-256 해시 (기본: admin1234 → 반드시 변경)
  //   변경 방법: 관리자 페이지 > 설정 > "비밀번호 해시 생성"
  adminPasswordSha256: 'ac9689e2272427085e35b9d3e3e8bed88cb3434828b43b86fc0596cad4c6e270',

  maxUploadMB: 15,
};
