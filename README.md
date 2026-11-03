# 차근 · 2단계
Next.js / TypeScript / Tailwind CSS / Supabase / GitHub Pages.

## 범위
로그인과 화면 틀에 할 일, 자유 과목, 항목별 타이머, 쪽잠, 실제 공부 시간표, 시간 수정, 하루 메모, 계정별 학교 시간표를 추가했다. 친구와 D-day는 이후 단계다. spec.md가 기능 기준이다.

## 기존 사이트 갱신
1. 기존 Supabase 프로젝트의 SQL Editor에서 `supabase/migrations/001_study_workspace.sql` 전체를 실행한다. 기존 계정은 유지된다.
2. 소스를 저장소 루트에 갱신한다. 기존 `.github/workflows/pages.yml`을 사용하며 main 변경 시 검사 후 Pages에 배포한다.
3. 본인 계정으로 로그인해 PC/iPad 동기화와 다른 계정의 데이터 격리를 확인한다.
4. 개인 수업표 파일은 GitHub에 올리지 않고 로그인 후 설정에서 가져온다.

## 개발 실행
Node.js 24에서 `npm ci`, `npm run dev`.
`.env.local`에는 Supabase 프로젝트 URL, 공개 publishable key와 `NEXT_PUBLIC_BASE_PATH=/chageun`만 지정한다. 관리자 비밀 키를 넣지 않는다. 배포 환경 값은 기존 워크플로에 설정되어 있다.

## 검사
`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
테스트는 시간 경계, 충돌·오프라인 저장과 PostgreSQL 호환 테스트 DB의 SQL/RLS 검사를 포함한다. 실제 Supabase Realtime 및 iPad 잠금/오프라인 재실행은 실제 기기에서 확인해야 한다.

## 저장과 한계
각 계정의 기록은 RLS로 보호된 study_workspaces에 저장한다. 서버 저장 완료 전에는 사용자별 기기 임시 저장 상태다. 기기 데이터를 지우면 미동기화 기록을 잃을 수 있다. 처음에는 인터넷이 필요하며 안전한 다중 탭 저장을 위해 Web Locks를 지원하는 HTTPS 브라우저를 사용한다.
충돌은 선택/수정으로 해결하고 해결 전 합계를 숨긴다. 기록 묶음은 5MB 이하로 제한하며 장기 데이터 확장은 다음 버전 SQL로 진행한다.
쪽잠은 화면 안내이며 잠금 화면 알림을 보장하지 않는다. 다크 모드는 현재 페이지 세션에서 적용한다. 기본 복구는 제공하지만 7일 자동 정리와 전체 백업은 6단계다.
