# 차근 1.2 · 계정 회원가입 · 비밀번호 재설정 · 계정별 이름

## 변경 사항
- 로그인하지 않았을 때 왼쪽 브랜드 문구 `차지훈의 근면성실` 유지.
- 로그인 후에는 `설정 → 내 이름 설정`에 저장한 이름으로 `{이름}의 근면성실` 표시. 사용자 메타데이터(`chageun_display_name`)에 계정별 저장. 이름 미설정 계정은 `나의 근면성실`로 표시.
- 로그인 화면: **회원가입**, **비밀번호 찾기** 추가.
- 회원가입: Supabase Auth의 이메일+비밀번호 `signUp`, 이메일 확인 링크는 `/chageun/`으로 귀환.
- 비밀번호 재설정: 이메일 발송 → 링크로 차근 열기 → 새로운 비밀번호 설정 → 로그아웃 후 재로그인.
- 작은 화면: 로그인 폼을 시계 카드 앞에 배치하여 회원가입 기능 쉽게 찾도록 개선.

## 기존 데이터 유지
기존 계정의 인증 정보, 공부 기록, 학교 시간표, 친구 연결은 삭제하거나 초기화하지 않습니다. 새로운 SQL을 실행할 필요도 없습니다. **기존 사용자는 새로 가입할 필요가 없습니다.**

## 설치
1. 압축 내부의 `01_UPLOAD_TO_GITHUB_ROOT` 폴더 **안의 파일과 폴더를** GitHub 차근 저장소 루트에 업로드합니다. `Commit changes`를 클릭합니다.
2. GitHub Actions 초록색 체크 확인 후 차근 사이트를 새로고침합니다.
3. **Supabase Authentication 설정은 별도 필요**합니다. 같은 압축의 `02_SUPABASE_SETTINGS/SETUP.txt`를 반드시 확인하세요.

## 검증 및 한계
- 로컬 기존+신규 순수 로직 테스트 총 49개 통과, 수정된 TypeScript/TSX 문법 검사 통과.
- 320~1280px의 8개 너비에서 UI 배치 모형이 가로로 넘치지 않는지 검사.
- Supabase 인증 이메일 발송, 실제 가입/재설정 링크, 전체 Next.js 빌드는 환경에서 실제 인증 서버에 접근하거나 패키지를 설치할 수 없어 미검증. GitHub Actions 빌드 결과와 실제 사이트에서 확인 필요.
- Supabase 무료 기본 메일 발송 서비스는 조직 구성원 주소에 한정되며, 일반 친구들의 이메일 인증 및 재설정을 받으려면 커스텀 SMTP 또는 Send Email Auth Hook이 필요할 수 있습니다. Email Confirm은 끄지 않는 것을 권장합니다.

공식 안내:
https://supabase.com/docs/guides/auth/redirect-urls
https://supabase.com/docs/guides/auth/auth-smtp
https://supabase.com/docs/guides/auth/passwords
