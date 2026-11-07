# 외부 서비스 설정 가이드

모든 값은 `.env.local`(로컬) 또는 Vercel 프로젝트의 Environment Variables 에 넣습니다. 설정 상태는 앱의 **계정 및 API 설정** 화면에서 확인할 수 있습니다(값은 표시되지 않음).

## 1. Supabase
1. https://supabase.com 에서 프로젝트 생성
2. SQL Editor → `supabase/migrations/0001_init.sql` 전체 실행
3. Project Settings → API 에서 값 복사
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (서버 전용 — 토큰 저장, Cron, API 로그에 사용)
4. 앱 `/login` 에서 관리자 계정 생성 → Authentication → Sign In / Providers 에서 **신규 가입 비활성화**
5. `APP_MODE=live`

## 2. Claude API
1. https://console.anthropic.com → API Keys → 키 생성
2. `ANTHROPIC_API_KEY=...` (선택: `ANTHROPIC_MODEL`, 기본 `claude-opus-5-5`)
3. 생성 요청은 서버 측 refusal fallback(`server-side-fallback-2026-07-01`, `fallbacks: "default"`)을 켜 둡니다. 안전 분류기가 요청을 거절하면 대체 모델로 자동 재시도됩니다. 원치 않으면 `src/lib/generate.ts` 에서 해당 두 줄을 제거하세요.

## 3. Meta Threads API
1. https://developers.facebook.com → 앱 만들기 → 사용 사례 **"Threads API 액세스"** 선택
2. 권한 추가: `threads_basic`, `threads_content_publish`, `threads_manage_replies`, `threads_manage_insights`
3. Threads 설정 → **리디렉션 콜백 URL** 에 `https://<도메인>/api/threads/callback` 등록 (로컬: `http://localhost:3000/api/threads/callback` 은 Meta 가 https 를 요구할 수 있어 배포 도메인 사용 권장)
4. 앱 역할 → **Threads 테스터**에 본인 Threads 계정 추가 → Threads 앱(웹) 설정 → 계정 → 웹사이트 권한 → 초대 수락
5. 환경 변수
   ```
   THREADS_APP_ID=...            # Threads 앱 ID (Meta 앱 ID 와 다를 수 있음)
   THREADS_APP_SECRET=...
   THREADS_REDIRECT_URI=https://<도메인>/api/threads/callback
   TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)
   ```
6. 앱의 설정 화면 → **Threads 계정 연결**
7. 검수(App Review) 전에는 테스터 계정에만 게시할 수 있습니다. 공개 운영 시 각 권한에 대한 앱 검수가 필요합니다.

**제한 사항 (공식 API 기준)**
- 24시간당 게시물 250개 · 답글 1,000개, 본문 500자, 이미지는 공개 https URL 만 가능
- 게시물 링크 클릭 수, 구매 데이터는 제공되지 않음 → 쿠팡 파트너스 실적(CSV)로 관리
- 답글 작성은 `threads_manage_replies` 권한이 있어야 하며, 실패해도 본문은 재게시하지 않고 알림만 보냄

## 4. 예약 실행 (Cron)
- `CRON_SECRET` 을 임의의 긴 문자열로 설정. Vercel Cron 은 자동으로 `Authorization: Bearer <CRON_SECRET>` 을 보냅니다.
- `vercel.json` 기본값은 Hobby 플랜에서도 배포되도록 **하루 1회**(UTC 00:00 = KST 09:00)입니다. Pro 플랜이면 publish 를 `*/5 * * * *` 로 바꾸세요.
- **Vercel Hobby 플랜은 Cron 이 하루 1회로 제한**됩니다. Pro 플랜을 쓰거나 외부 스케줄러로 호출하세요. 예) GitHub Actions:
  ```yaml
  on: { schedule: [{ cron: "*/5 * * * *" }] }
  jobs:
    tick:
      runs-on: ubuntu-latest
      steps:
        - run: curl -fsS -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" https://<도메인>/api/cron/publish
  ```
  (GitHub 예약 실행은 수 분 지연될 수 있습니다.)

## 5. 쿠팡 파트너스
- **기본 방식(권한 없이 가능)**: 파트너스 사이트에서 만든 제휴 링크를 상품에 직접 입력, 실적은 파트너스 리포트를 CSV 로 업로드.
- **Open API (최종 승인 + 키 발급 후)**: `COUPANG_ACCESS_KEY`, `COUPANG_SECRET_KEY` 설정 시 상품 화면의 "제휴 링크 생성"(딥링크 API)이 활성화됩니다.
- 게시물별 성과를 보려면 딥링크 생성 시 `subId` 에 게시물 **추적코드**(콘텐츠 검토 화면 표시)를 사용하고, CSV 의 `sub_id` 열에 같은 값을 넣으세요.
- 상품 정보 자동 조회(검색 API)는 API 사용 권한이 확인된 뒤 `src/lib/coupang.ts` 의 서명 함수로 추가할 수 있습니다. 크롤링은 지원하지 않습니다.

## 6. 실패 알림 (선택)
`NOTIFY_WEBHOOK_URL` 에 Slack Incoming Webhook 또는 Discord Webhook URL 을 넣으면 발행 실패/답글 실패 시 메시지를 보냅니다. 앱 내 알림(대시보드)은 항상 기록됩니다.

## 7. 광고 표시 문구
`src/lib/disclosure.ts` 에서 관리합니다. 본문 끝 `#광고 ...` 표시(공정위 지침: 본문에 표시 필요)와 답글의 쿠팡 파트너스 안내 문구를 최신 정책에 맞게 확인·수정하세요.
