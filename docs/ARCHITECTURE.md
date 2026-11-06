# 아키텍처 및 데이터베이스 설계

## 1. 전체 구조

```
┌──────────────────────────── Next.js (Vercel) ────────────────────────────┐
│  App Router 화면 (Server Components + Server Actions, JS 없이도 폼 동작)     │
│   대시보드 / 상품 / 생성 / 승인 / 캘린더 / 기록 / 분석 / 설정               │
│                                                                          │
│  src/app/actions.ts ── 모든 변경 작업 (인증된 사용자 컨텍스트로 실행)        │
│  src/app/api/cron/*  ── Vercel Cron (Bearer CRON_SECRET)                  │
│  src/app/api/threads/* ── OAuth 연결/콜백                                  │
│                                                                          │
│  src/lib                                                                 │
│   ├ store/  Store 인터페이스 ─┬ SupabaseStore (live, RLS / service role)   │
│   │                          └ MockStore (mock, .data/mock-db.json)        │
│   ├ generate.ts   Claude 구조화 출력으로 글 3개 생성 (mock: 템플릿)         │
│   ├ review.ts     자동 검수 6항목 + 승인 게이트                              │
│   ├ schedule.ts   시간대/슬롯/일일 한도/백오프 (순수 함수)                    │
│   ├ publisher.ts  예약·선점·발행·답글·재시도·인사이트                         │
│   ├ threads.ts    Threads Graph API (OAuth, 컨테이너→publish, insights)     │
│   ├ crypto.ts     액세스 토큰 AES-256-GCM 암호화                              │
│   ├ coupang.ts    쿠팡 파트너스 Open API 딥링크 (키 있을 때만)               │
│   └ analytics.ts / csv.ts  성과 집계 (null = 측정 안 됨), CSV 가져오기       │
└──────────────────────────────────────────────────────────────────────────┘
        │ Supabase (Postgres + Auth)          │ graph.threads.net     │ api.anthropic.com
```

### 실행 모드
| | mock | live |
|---|---|---|
| 저장소 | 로컬 JSON 파일 | Supabase |
| 인증 | 없음(모의 사용자) | Supabase Auth (proxy.ts 가 미로그인 차단) |
| Claude | 템플릿 생성, `[모의 생성]` 표시 | 실제 API, 키 없으면 생성 거부 |
| Threads | 가짜 media id, 네트워크 없음 | 공식 API, 계정 미연결 시 실패 처리 |
| 데이터 표시 | 모든 행 `is_mock`, 보라색 배지·배너 | 실제 데이터 |

모의 데이터는 live DB 에 절대 쓰이지 않습니다(저장소 자체가 다름). live 모드에서 키가 없는 기능은 모의로 대체하지 않고 **오류와 설정 안내**를 보여줍니다.

## 2. 핵심 흐름

```
상품 등록 ─▶ AI 생성(초안 3개, 서로 다른 유형) ─▶ 자동 검수
   ─▶ 사람 검토(수정 · 6개 항목 체크) ─▶ 승인(approved)
   ─▶ 예약(publish_jobs: pending, 일일 한도/슬롯 검사)
   ─▶ Cron: pending→processing 선점 ─▶ Threads 게시 ─▶ 제휴 링크 답글
   ─▶ published / 실패 시 백오프 재시도(최대 3회) → 최종 실패 알림
   ─▶ 인사이트 수집(Cron) + 쿠팡 실적 CSV ─▶ 상품별/유형별/게시물별 분석
```

콘텐츠 상태: `draft → approved → scheduled → published` (+ `rejected`, `failed`). 본문을 수정하면 해시가 바뀌고 승인이 초기화됩니다. 발행 직전에도 `approved_at`, 상태, 해시 일치를 다시 확인합니다.

### 중복 발행 방지 (4중)
1. `pending → processing` 조건부 UPDATE (같은 `attempts` 값일 때만) — 동시 실행 중 하나만 선점
2. 발행 직전 같은 `content_hash` 의 `published` 작업 존재 여부 확인
3. DB 부분 고유 인덱스: 콘텐츠당 활성 작업 1개, 사용자·해시당 published 1개
4. `processing` 에서 15분 넘게 멈춘 작업은 **자동 재시도하지 않고** 실패 + 사람 확인 요청 (실제로 게시됐을 수 있으므로)

## 3. 데이터베이스 (supabase/migrations/0001_init.sql)

| 테이블 | 용도 | 주요 컬럼 |
|---|---|---|
| `products` | 상품 | name, category, price(null=미확인), features[], coupang_url, affiliate_url, image_url, image_rights, info_verified_at, is_mock |
| `reference_posts` | 사용자 기존 게시물(말투 참고·중복 검사) | body, note |
| `contents` | AI 생성 콘텐츠 | product_id, content_type, body, reply_text, status, content_hash, tracking_code(subId), review(jsonb), generation(jsonb), approved_at |
| `publish_jobs` | 예약 + 발행 결과 | content_id, content_hash, scheduled_at, status, attempts, next_attempt_at, last_error, threads_media_id, threads_reply_id, reply_error, permalink, published_at |
| `settings` | 사용자 설정 | timezone, daily_limit(1~3), posting_times[], autopublish_paused, post_affiliate_reply |
| `threads_accounts` | Threads 토큰 (**service role 전용**, 정책 없음) | threads_user_id, username, access_token_enc, token_expires_at |
| `post_insights` | Threads 인사이트 | views, likes, replies, reposts, quotes (null 허용), source |
| `affiliate_metrics` | 클릭/구매/수수료 | metric_date, content_id, product_id, sub_id, clicks, orders, commission, source(csv/manual/tracker/mock), import_batch |
| `api_logs` | API 오류/호출 기록 | provider, action, ok, status_code, message |
| `notifications` | 실패 알림 | level, message, read |
| `oauth_states` | OAuth CSRF state | state, user_id |

- 모든 사용자 테이블은 RLS `user_id = auth.uid()`.
- `api_logs`, `post_insights` 는 사용자에게 읽기만 허용, 쓰기는 서버(service role).
- 성과 지표는 모두 nullable — `0` 과 `측정 안 됨` 을 구분합니다.

## 4. 보안
- API 키/시크릿은 서버 환경 변수에만 존재 (`NEXT_PUBLIC_` 접두사 금지). 화면에는 설정 여부만 표시.
- Threads 장기 토큰은 AES-256-GCM 으로 암호화 후 service role 전용 테이블에 저장, 만료 7일 전 자동 갱신.
- Cron 엔드포인트는 `Authorization: Bearer CRON_SECRET` 상수 시간 비교.
- 링크 확인은 쿠팡 도메인에만 서버 요청 (SSRF 방지), 리디렉션 미추적.
- OAuth `state` 를 DB 에 저장해 15분 내 1회만 사용.
