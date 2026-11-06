-- AI Commerce Autopilot — 초기 스키마
-- Supabase SQL Editor 에서 실행하거나 `supabase db push` 로 적용합니다.
-- 모든 사용자 데이터 테이블은 RLS 로 user_id = auth.uid() 범위만 접근 가능합니다.
-- 토큰 테이블(threads_accounts)은 클라이언트 접근 정책이 없으며 service role 로만 접근합니다.

create extension if not exists "pgcrypto";

-- ───────────── ENUM ─────────────
create type image_rights as enum ('own', 'licensed', 'partners_provided', 'unknown');
create type content_type as enum ('problem_solving', 'feature', 'checklist', 'comparison', 'seasonal');
create type content_status as enum ('draft', 'approved', 'rejected', 'scheduled', 'published', 'failed');
create type job_status as enum ('pending', 'processing', 'published', 'failed', 'cancelled');
create type data_source as enum ('threads_api', 'csv', 'manual', 'tracker', 'mock');

-- ───────────── 상품 ─────────────
create table products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  category text not null default '',
  price integer,                       -- 확인된 가격(원). 모르면 null
  features text[] not null default '{}',
  coupang_url text not null default '',
  affiliate_url text not null default '',
  image_url text,
  image_rights image_rights not null default 'unknown',
  info_verified_at date,               -- 상품 정보 확인일
  notes text not null default '',
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on products (user_id, created_at desc);

-- ───────────── 참고용 기존 게시물 ─────────────
create table reference_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null,
  note text not null default '',
  is_mock boolean not null default false,
  created_at timestamptz not null default now()
);

-- ───────────── AI 생성 콘텐츠 ─────────────
create table contents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  content_type content_type not null,
  body text not null,                  -- 본문 (Threads 500자 제한)
  reply_text text not null default '', -- 제휴 링크 + 광고 표시 답글
  image_url text,
  status content_status not null default 'draft',
  content_hash text not null,          -- 정규화 본문 해시 (중복 발행 방지)
  tracking_code text not null,         -- 쿠팡 파트너스 subId 등에 사용
  review jsonb not null default '{}'::jsonb,
  generation jsonb not null default '{}'::jsonb, -- {model, mock, generated_at}
  is_mock boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on contents (user_id, status);
create unique index contents_tracking_code_key on contents (tracking_code);

-- ───────────── 발행 작업 (예약 + 결과) ─────────────
create table publish_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_id uuid not null references contents(id) on delete cascade,
  content_hash text not null,
  scheduled_at timestamptz not null,
  status job_status not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  next_attempt_at timestamptz,
  last_error text,
  threads_media_id text,
  threads_reply_id text,
  reply_error text,
  permalink text,
  published_at timestamptz,
  is_mock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on publish_jobs (status, scheduled_at);
-- 같은 콘텐츠에 대해 활성(취소 아님) 작업은 하나만 허용
create unique index publish_jobs_one_active_per_content
  on publish_jobs (content_id) where status <> 'cancelled';
-- 같은 본문(해시)이 두 번 발행 완료되는 것을 DB 수준에서 차단
create unique index publish_jobs_one_published_per_hash
  on publish_jobs (user_id, content_hash) where status = 'published';

-- ───────────── 설정 ─────────────
create table settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  timezone text not null default 'Asia/Seoul',
  daily_limit integer not null default 3 check (daily_limit between 1 and 3),
  posting_times text[] not null default '{09:00,13:00,20:00}',
  autopublish_paused boolean not null default false,
  post_affiliate_reply boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Threads 계정/토큰: 서버(service role) 전용. RLS 활성 + 정책 없음 → anon/auth 키로 접근 불가
create table threads_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  threads_user_id text not null,
  username text,
  access_token_enc text not null,      -- AES-256-GCM 암호문
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────── 성과 ─────────────
create table post_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references publish_jobs(id) on delete cascade,
  content_id uuid not null references contents(id) on delete cascade,
  views integer,
  likes integer,
  replies integer,
  reposts integer,
  quotes integer,
  source data_source not null,
  fetched_at timestamptz not null default now()
);
create unique index post_insights_job_key on post_insights (job_id);

-- 제휴 실적 (쿠팡 파트너스 리포트 CSV / 수동 입력 / 자체 클릭 추적)
create table affiliate_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  metric_date date not null,
  product_id uuid references products(id) on delete set null,
  content_id uuid references contents(id) on delete set null,
  sub_id text,
  clicks integer,
  orders integer,
  commission integer,                  -- 원
  source data_source not null,
  import_batch text,
  created_at timestamptz not null default now()
);
create index on affiliate_metrics (user_id, metric_date);

-- ───────────── 운영 ─────────────
create table api_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  provider text not null,              -- threads | claude | coupang | system
  action text not null,
  ok boolean not null,
  status_code integer,
  message text,
  created_at timestamptz not null default now()
);
create index on api_logs (user_id, created_at desc);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  level text not null default 'info',  -- info | warning | error
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- OAuth state (CSRF 방지)
create table oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ───────────── RLS ─────────────
alter table products enable row level security;
alter table reference_posts enable row level security;
alter table contents enable row level security;
alter table publish_jobs enable row level security;
alter table settings enable row level security;
alter table threads_accounts enable row level security;
alter table post_insights enable row level security;
alter table affiliate_metrics enable row level security;
alter table api_logs enable row level security;
alter table notifications enable row level security;
alter table oauth_states enable row level security;

create policy own_products on products for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_refs on reference_posts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_contents on contents for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_jobs on publish_jobs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_settings on settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_insights on post_insights for select using (user_id = auth.uid());
create policy own_metrics on affiliate_metrics for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_logs on api_logs for select using (user_id = auth.uid());
create policy own_notifications on notifications for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- threads_accounts, oauth_states: 정책 없음(서버 전용)

-- updated_at 자동 갱신
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger t_products before update on products for each row execute function touch_updated_at();
create trigger t_contents before update on contents for each row execute function touch_updated_at();
create trigger t_jobs before update on publish_jobs for each row execute function touch_updated_at();
create trigger t_settings before update on settings for each row execute function touch_updated_at();
