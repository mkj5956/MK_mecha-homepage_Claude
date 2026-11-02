# GitHub 설정 가이드 (비개발자용 · 그대로 따라하기)

> Claude는 GitHub 저장소의 **설정**(공개 전환, Pages 켜기)을 대신 바꿀 수 없다. 코드 push·PR·머지까지만 가능하다.
> 아래 절차를 사용자에게 안내할 때 `<아이디>` `<저장소>` 를 실제 값으로 바꾼 **직접 링크**로 준다.

## 0. 시작 전에 꼭 알려줄 3가지
1. **GitHub 모바일 앱에는 저장소 Settings 메뉴가 없다.** PC 브라우저나 휴대폰 브라우저(데스크톱 사이트 보기)로 github.com 에 접속해야 한다.
2. **무료 계정은 공개(Public) 저장소에서만 GitHub Pages를 쓸 수 있다.** 비공개(Private)라면 ① 공개 전환 ② GitHub Pro(월 $4) ③ Cloudflare Pages(무료, 비공개 유지) 중 하나를 고른다.
3. 공개 전에 **관리자 비밀번호를 기본값에서 바꾸고**, 저장소에 개인정보·토큰이 없는지 확인한다. 약한 비밀번호는 해시로 저장해도 쉽게 풀린다.

## 1. GitHub 가입 · 저장소 만들기 (처음인 경우)
1. https://github.com/signup → 이메일·비밀번호·아이디 → 이메일 인증
2. 오른쪽 위 **＋ → New repository**
3. Repository name 은 영문·숫자·`-`·`_` 만 쓴다(공백·괄호·한글은 `-` 로 바뀐다). 예) `my-homepage`
4. 무료로 Pages 를 쓰려면 **Public** → **Create repository**
5. 코드는 Claude 가 push 한다. 직접 올릴 때는 저장소 화면 **Add file → Upload files** 에 폴더째 끌어다 놓고 **Commit changes**.

## 2. Claude 가 저장소에 접근하게 하기
1. claude.ai → 설정 → 커넥터(Connectors) → **GitHub 연결**
2. Claude GitHub App 저장소 권한: https://github.com/apps/claude/installations/select_target → 내 계정 **Configure** → **Repository access** 에서 저장소 추가(또는 All repositories) → **Save**
   - "선택한 저장소만" 으로 설정했다면 **새로 만든 저장소는 자동으로 추가되지 않는다.** Claude 가 "저장소를 찾을 수 없다" 고 하면 대부분 이 문제다.
3. Claude 에게 저장소 주소(`https://github.com/<아이디>/<저장소>`)를 알려준다.

## 3. PR(Pull Request) 머지
Claude 는 보통 작업 브랜치에 올리고 PR 을 만든다. main 에 합쳐야 홈페이지에 반영된다.
1. `https://github.com/<아이디>/<저장소>/pulls` → 해당 PR
2. **Files changed** 탭에서 변경 내용 확인(선택)
3. 초록색 **Merge pull request → Confirm merge**
   또는 Claude 에게 "머지해줘" 라고 요청한다(연결이 정상일 때).

## 4. 비공개 → 공개 전환 (무료 Pages 용)
1. `https://github.com/<아이디>/<저장소>/settings`
2. 맨 아래 빨간 **Danger Zone → Change visibility → Change to public**
3. 안내 문구대로 저장소 이름 입력 → 확인

## 5. GitHub Pages 켜기
1. `https://github.com/<아이디>/<저장소>/settings/pages`
2. **Build and deployment → Source: Deploy from a branch**
3. **Branch: `main`**, 폴더 **`/ (root)`** → **Save**
4. 1~3분 뒤 새로고침 → 위쪽에 **"Your site is live at https://<아이디>.github.io/<저장소>/"**
5. 이후 main 에 push(또는 PR 머지)할 때마다 1~2분 안에 자동 반영된다.

### 확인
- `https://github.com/<아이디>/<저장소>/actions` 에 **pages build and deployment** 초록 체크
- 404 가 나오면 2~5분 더 기다린 뒤 강력 새로고침(Ctrl+F5), 저장소 맨 위(루트)에 `index.html` 이 있는지 확인

## 6. 비공개를 유지하고 싶을 때: Cloudflare Pages (무료)
1. https://dash.cloudflare.com/sign-up 가입
2. **Workers & Pages → Create → Pages → Connect to Git** → GitHub 연결 → 저장소 선택
3. Framework preset **None**, Build command **비움**, Build output directory **`/`** → **Save and Deploy**
4. 주소는 `https://<프로젝트명>.pages.dev`. main 에 push 하면 자동 재배포된다.

## 7. 개인 도메인 연결 (선택)
- GitHub Pages: Settings → Pages → **Custom domain** 에 `www.example.com` 입력 → 도메인 업체 DNS 에 `CNAME  www → <아이디>.github.io` 추가 → **Enforce HTTPS** 체크
- Cloudflare Pages: 프로젝트 → **Custom domains → Set up a domain**

## 8. 자주 막히는 곳
| 상황 | 해결 |
|---|---|
| Settings 메뉴가 안 보임 | 모바일 앱 대신 브라우저로 접속, "데스크톱 사이트 보기" |
| Pages 화면에 "Upgrade" 안내 | 비공개 저장소 + 무료 계정 → 공개 전환 또는 Cloudflare Pages |
| Branch 목록에 main 만 있고 코드가 없음 | PR 이 아직 머지 안 됨 → 먼저 머지 |
| 사이트가 예전 화면 그대로 | 1~2분 기다린 뒤 강력 새로고침, Actions 탭에서 배포 완료 확인 |
| `_` 로 시작하는 파일이 404 | 저장소 루트에 빈 `.nojekyll` 파일 추가 |
| 스크립트 불러오기 오류 | 파일 경로의 대소문자까지 일치하는지 확인 (Pages 는 대소문자 구분) |
| Claude 가 저장소를 못 찾음 / push 실패 | 2번의 Claude GitHub App 저장소 권한 확인, claude.ai 커넥터 재연결 |
