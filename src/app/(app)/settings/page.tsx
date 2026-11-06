import { disconnectThreads, saveSettings } from "@/app/actions";
import { Submit } from "@/components/submit";
import { Badge, Flash, flash, fmtDateTime, PageHeader, type SP } from "@/components/ui";
import { getCtx } from "@/lib/ctx";
import { env, integrationStatus } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { THREADS_SCOPES } from "@/lib/threads";
import { getAccountInfo } from "@/lib/threads-account";
import { MAX_DAILY_LIMIT } from "@/lib/types";

function Row({ ok, label, children }: { ok: boolean; label: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex w-56 shrink-0 items-center gap-2 font-medium">
        <Badge tone={ok ? "green" : "slate"}>{ok ? "설정됨" : "미설정"}</Badge>
        {label}
      </div>
      <div className="text-sm text-slate-600">{children}</div>
    </li>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: SP }) {
  const { msg, err } = await flash(searchParams);
  const ctx = await getCtx();
  const [settings, account] = await Promise.all([getSettings(ctx.store, ctx.userId), getAccountInfo(ctx.userId)]);
  const st = integrationStatus();

  return (
    <>
      <PageHeader title="계정 및 API 설정" desc="API 키와 토큰은 서버 환경 변수/암호화 저장소에만 보관되며 화면에 표시되지 않습니다." />
      <Flash msg={msg} err={err} />

      <section className="card mb-4">
        <h2 className="mb-1 font-semibold">Threads 계정</h2>
        {account.mock ? (
          <p className="muted">모의 모드: 실제 계정을 연결하지 않고 발행을 흉내냅니다. 본문에 <code>[실패테스트]</code> 를 넣으면 실패·재시도 흐름을 시험할 수 있습니다.</p>
        ) : account.connected ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge tone="green">연결됨</Badge> @{account.username ?? "알 수 없음"} · 토큰 만료 {fmtDateTime(account.expiresAt)} (만료 7일 전 자동 갱신)
            <form action={disconnectThreads}>
              <Submit className="btn-danger text-xs" confirm="연결을 해제하면 예약 발행이 실패합니다. 계속할까요?">연결 해제</Submit>
            </form>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="text-slate-600">연결된 계정이 없습니다. 요청 권한: {THREADS_SCOPES.join(", ")}</p>
            <a href="/api/threads/connect" className="btn-primary">Threads 계정 연결</a>
          </div>
        )}
      </section>

      <form action={saveSettings} className="card mb-4 grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">예약 발행 설정</h2>
        <div>
          <label className="label" htmlFor="daily_limit">하루 최대 게시물 (MVP 최대 {MAX_DAILY_LIMIT})</label>
          <input id="daily_limit" name="daily_limit" type="number" min={1} max={MAX_DAILY_LIMIT} defaultValue={settings.daily_limit} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="timezone">시간대</label>
          <input id="timezone" name="timezone" defaultValue={settings.timezone} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="posting_times">게시 시간 (쉼표로 구분, HH:MM)</label>
          <input id="posting_times" name="posting_times" defaultValue={settings.posting_times.join(", ")} className="input" />
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="post_affiliate_reply" defaultChecked={settings.post_affiliate_reply} />
          게시 직후 내 게시물에 제휴 링크 + 수수료 안내 답글 작성 (threads_manage_replies 권한 필요)
        </label>
        <p className="text-xs text-slate-500 sm:col-span-2">
          자동 발행 상태: <strong>{settings.autopublish_paused ? "일시 정지" : "동작 중"}</strong> — 예약 캘린더에서 언제든 정지/재개할 수 있습니다.
        </p>
        <div className="flex justify-end sm:col-span-2">
          <Submit>저장</Submit>
        </div>
      </form>

      <section className="card mb-4">
        <h2 className="font-semibold">서버 연동 상태</h2>
        <p className="muted">현재 실행 모드: <strong>{st.mode === "live" ? "live (실제 운영)" : "mock (모의)"}</strong> — 환경 변수 <code>APP_MODE</code></p>
        <ul className="divide-y divide-slate-100">
          <Row ok={st.supabase && st.supabaseServiceRole} label="Supabase">
            NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY. <code>supabase/migrations/0001_init.sql</code> 을 SQL Editor 에서 실행하세요.
          </Row>
          <Row ok={st.claude} label="Claude API">
            ANTHROPIC_API_KEY (console.anthropic.com). 모델: <code>{st.claudeModel}</code> (ANTHROPIC_MODEL 로 변경 가능).
          </Row>
          <Row ok={st.threadsApp && st.tokenEncryption} label="Threads API">
            developers.facebook.com 에서 앱 생성 → &apos;Threads API 액세스&apos; 사용 사례 추가 → 권한 {THREADS_SCOPES.join(", ")} 추가 →
            리디렉션 콜백 URL 에 <code>{env.threadsRedirectUri()}</code> 등록 → 앱 역할에 본인 Threads 계정을 테스터로 추가(앱 검수 전).
            THREADS_APP_ID, THREADS_APP_SECRET, TOKEN_ENCRYPTION_KEY 설정.
          </Row>
          <Row ok={st.cron} label="예약 실행 (Cron)">
            CRON_SECRET 설정 후 /api/cron/publish 를 5분마다 호출. Vercel Hobby 플랜은 Cron 이 하루 1회로 제한되므로 Pro 플랜 또는 외부 스케줄러(GitHub Actions, Supabase pg_cron)를 사용하세요.
          </Row>
          <Row ok={st.coupang} label="쿠팡 파트너스 Open API">
            파트너스 최종 승인 후 발급되는 Access/Secret Key (COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY). 없으면 제휴 링크를 수동 입력하고 실적은 CSV 로 업로드합니다.
          </Row>
          <Row ok={st.notifyWebhook} label="실패 알림 Webhook">
            선택: NOTIFY_WEBHOOK_URL (Slack/Discord 호환). 설정하지 않아도 앱 내 알림은 항상 기록됩니다.
          </Row>
        </ul>
      </section>

      <section className="card text-sm text-slate-600">
        <h2 className="mb-2 font-semibold text-slate-900">정책 및 제한 안내</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Threads 공식 API 만 사용합니다. 비공식 자동화, 다계정 운영, 스크래핑은 지원하지 않습니다.</li>
          <li>Threads API 제한: 24시간당 게시물 250개 · 답글 1,000개 · 본문 500자. 이 앱은 하루 최대 {MAX_DAILY_LIMIT}개로 더 보수적으로 운영합니다.</li>
          <li>Threads API 는 게시물 링크 클릭 수·구매 데이터를 제공하지 않습니다. 클릭/구매/수수료는 쿠팡 파트너스 리포트(CSV)로 관리합니다.</li>
          <li>앱 검수(App Review) 전에는 앱에 테스터로 등록된 계정에만 게시할 수 있습니다.</li>
          <li>경제적 대가가 있는 게시물은 본문에 광고 표시가 필요합니다(공정위 추천·보증 심사지침). 답글에만 표시하는 것은 부족합니다.</li>
        </ul>
      </section>
    </>
  );
}
