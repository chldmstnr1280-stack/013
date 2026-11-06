# AI Commerce Autopilot

쿠팡 파트너스 상품을 Threads 에서 홍보하기 위한 **AI 콘텐츠 생성 → 사람 승인 → 예약 발행 → 성과 분석** 웹 애플리케이션 (MVP: Threads 계정 1개, 하루 최대 3개 게시물).

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Supabase (Postgres + Auth + RLS)
- Claude API (`@anthropic-ai/sdk`, 구조화 출력)
- Meta Threads 공식 Graph API
- Vercel (배포 + Cron)

> 설계 문서: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · 단계별 구현/테스트: [`docs/STAGES.md`](docs/STAGES.md) · 외부 API 설정: [`docs/SETUP.md`](docs/SETUP.md)

## 빠른 시작 (모의 모드 — API 키 불필요)

```bash
npm install
cp .env.example .env.local   # APP_MODE=mock 그대로 두면 됨
npm run dev                   # http://localhost:3000
```

모의 모드에서는:

- 데이터가 로컬 파일 `.data/mock-db.json` 에 저장되며 Supabase(운영 DB)와 **물리적으로 분리**됩니다.
- Claude/Threads/쿠팡 API 를 **호출하지 않습니다.** 생성 글에는 `[모의 생성]`, 모든 행에는 `is_mock` / `source='mock'` 이 붙고 화면에 보라색 **모의** 배지와 상단 배너가 표시됩니다.
- 본문에 `[실패테스트]` 를 넣으면 발행 실패 → 자동 재시도 흐름을 시험할 수 있습니다.
- `npm run seed:mock` 으로 모의 데이터를 초기화합니다.

## 실제 운영 (live 모드)

1. Supabase 프로젝트 생성 → SQL Editor 에서 `supabase/migrations/0001_init.sql` 실행
2. `.env.local` 에 `APP_MODE=live` 와 각 키 입력 (`.env.example` 참고, 상세: [`docs/SETUP.md`](docs/SETUP.md))
3. `npm run dev` → `/login` 에서 관리자 계정 생성 후 Supabase 에서 신규 가입 비활성화
4. **계정 및 API 설정** 메뉴에서 Threads 계정 연결
5. Vercel 배포 + `CRON_SECRET` 설정 → `/api/cron/publish` 가 5분마다 예약 발행 처리

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build && npm start` | 프로덕션 빌드/실행 |
| `npm test` | 단위 테스트 (검수 규칙, 스케줄러, CSV, 분석 집계, 중복 방지 제약) |
| `npm run lint` | 타입 검사 |
| `npm run seed:mock` | 모의 데이터 초기화 |

## 화면

대시보드 · 상품 관리 · AI 콘텐츠 생성 · 콘텐츠 승인 · 예약 캘린더 · 발행 기록 · 수익 분석 · 계정 및 API 설정 (모바일/PC 반응형)

## 의도적으로 구현하지 않은 것

- 쿠팡 상품 페이지 크롤링/스크래핑, 비공식 Threads 자동화, 다계정 운영
- 실제 사용하지 않은 상품의 사용 후기, 확인되지 않은 가격·할인율·효능·판매량 생성
- Threads 가 제공하지 않는 링크 클릭/구매 수치의 추정 표시 (측정 안 된 값은 `—`)
