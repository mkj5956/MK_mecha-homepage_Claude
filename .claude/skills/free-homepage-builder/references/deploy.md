# 설치 절차 (사용자 안내용 — README에 그대로 옮겨 쓰기)

## A. 홈페이지 공개 (GitHub Pages, 5분)
1. 코드를 GitHub 저장소 `main` 브랜치에 올린다 (작업 브랜치라면 PR로 머지).
2. 저장소 **Settings → Pages → Branch: `main` / `(root)` → Save**
3. 1~3분 후 `https://<아이디>.github.io/<저장소명>/` 접속.
4. 이후에는 코드를 push 하면 자동으로 반영된다.
5. (선택) 개인 도메인: Pages 설정의 Custom domain + 도메인 DNS에 CNAME 레코드 추가.

## B. 접수 서버 (Google Apps Script, 10분)
1. https://script.google.com → 새 프로젝트 → `Code.gs`에 템플릿 붙여넣기 → 저장
2. ⚙ 프로젝트 설정 → 스크립트 속성 → `ADMIN_EMAIL` 추가
3. 함수 `setup` 선택 → 실행 → 권한 승인 → 로그에서 `ADMIN_TOKEN` 복사
4. 배포 → 새 배포 → 유형 **웹 앱** → 실행: **나** / 액세스: **모든 사용자** → URL 복사
5. `js/config.js`의 `appsScriptUrl`에 URL 입력 → 커밋
6. 관리자 페이지 → 설정에 URL·토큰 입력 → 연결 테스트
7. Code.gs를 수정하면 **배포 관리 → 편집 → 새 버전**으로 재배포해야 반영된다.

## C. 출시 전 체크리스트
- [ ] `config.js` 연락처·회사명 실제 값
- [ ] 관리자 비밀번호 해시 변경 (기본값 금지)
- [ ] 폼 실제 제출 → 시트 행·드라이브 파일·알림 메일 확인
- [ ] Apps Script URL 비운 상태에서도 대체 경로(mailto) 동작
- [ ] 휴대폰 화면 확인 (가로 스크롤 없음)
- [ ] 개인정보 수집 동의 문구
- [ ] 관리자 백업 1회 실행
- [ ] 콘솔 에러 0건 (Playwright 스모크 테스트)
