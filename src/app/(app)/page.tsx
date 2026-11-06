import Link from "next/link";
import { markNotificationsRead } from "../actions";
import { Badge, Flash, flash, fmtDateTime, JobStatusBadge, MockBadge, PageHeader, Stat, type SP } from "@/components/ui";
import { Submit } from "@/components/submit";
import { buildAnalytics } from "@/lib/analytics";
import { getCtx } from "@/lib/ctx";
import { integrationStatus } from "@/lib/env";
import { countOnDay, effectiveLimit, localDate } from "@/lib/schedule";
import { getSettings } from "@/lib/settings";
import { num, won } from "@/lib/text";
import { getAccountInfo } from "@/lib/threads-account";

export default async function Dashboard({ searchParams }: { searchParams: SP }) {
  const { msg, err } = await flash(searchParams);
  const ctx = await getCtx();
  const eq = { eq: { user_id: ctx.userId } };
  const [products, contents, jobs, insights, metrics, notes, settings, account] = await Promise.all([
    ctx.store.list("products", eq),
    ctx.store.list("contents", eq),
    ctx.store.list("publish_jobs", eq),
    ctx.store.list("post_insights", eq),
    ctx.store.list("affiliate_metrics", eq),
    ctx.store.list("notifications", { ...eq, order: { column: "created_at", ascending: false }, limit: 8 }),
    getSettings(ctx.store, ctx.userId),
    getAccountInfo(ctx.userId),
  ]);
  const a = buildAnalytics({ products, contents, jobs, insights, metrics });
  const tz = settings.timezone;
  const today = localDate(new Date(), tz);
  const upcoming = jobs
    .filter((j) => j.status === "pending" || j.status === "processing")
    .sort((x, y) => x.scheduled_at.localeCompare(y.scheduled_at))
    .slice(0, 5);
  const failed = jobs.filter((j) => j.status === "failed");
  const byId = new Map(contents.map((c) => [c.id, c]));
  const st = integrationStatus();
  const drafts = contents.filter((c) => c.status === "draft").length;
  const approved = contents.filter((c) => c.status === "approved").length;
  const unread = notes.filter((n) => !n.read).length;

  return (
    <>
      <PageHeader
        title="대시보드"
        desc={`오늘(${today}) 예약 ${countOnDay(jobs, today, tz)} / 하루 최대 ${effectiveLimit(settings)}개`}
        actions={
          <>
            <Link className="btn-primary" href="/generate">콘텐츠 생성</Link>
            <Link className="btn-secondary" href="/calendar">예약 캘린더</Link>
          </>
        }
      />
      <Flash msg={msg} err={err} />

      {settings.autopublish_paused && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          자동 발행이 <strong>일시 정지</strong> 상태입니다. 예약 시간이 지나도 게시되지 않습니다.{" "}
          <Link href="/calendar" className="underline">재개하기</Link>
        </div>
      )}
      {failed.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          발행 실패 {failed.length}건이 있습니다. <Link href="/history?status=failed" className="underline">발행 기록 확인</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="검토 대기 초안" value={drafts} hint={<Link href="/review" className="text-brand-600">승인하러 가기 →</Link>} />
        <Stat label="승인 · 예약 전" value={approved} hint="예약 캘린더에서 시간 지정" />
        <Stat label="발행된 게시물" value={a.total.posts} />
        <Stat label="총 조회수" value={num(a.total.views)} hint={a.total.views === null ? "인사이트 미수집" : undefined} />
        <Stat label="제휴 링크 클릭" value={num(a.total.clicks)} hint={a.total.clicks === null ? "CSV/추적 데이터 없음" : undefined} />
        <Stat label="구매 전환" value={num(a.total.orders)} hint={a.total.orders === null ? "실적 데이터 없음" : undefined} />
        <Stat label="발생 수수료" value={won(a.total.commission)} hint={a.total.commission === null ? "실적 데이터 없음" : undefined} />
        <Stat label="등록 상품" value={products.length} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">다가오는 예약</h2>
          {upcoming.length === 0 ? (
            <p className="muted">예약된 게시물이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcoming.map((j) => (
                <li key={j.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{fmtDateTime(j.scheduled_at, tz)}</div>
                    <div className="truncate text-slate-500">{byId.get(j.content_id)?.body.split("\n")[0]}</div>
                  </div>
                  <span className="flex shrink-0 gap-1">
                    <MockBadge show={j.is_mock} />
                    <JobStatusBadge s={j.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">알림 {unread > 0 && <Badge tone="blue">{unread}</Badge>}</h2>
            {unread > 0 && (
              <form action={markNotificationsRead}>
                <Submit className="text-xs text-brand-600 hover:underline">모두 읽음</Submit>
              </form>
            )}
          </div>
          {notes.length === 0 ? (
            <p className="muted">알림이 없습니다.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {notes.map((n) => (
                <li key={n.id} className={`rounded-lg px-3 py-2 ${n.level === "error" ? "bg-red-50 text-red-700" : n.level === "warning" ? "bg-amber-50 text-amber-800" : "bg-slate-50"} ${n.read ? "opacity-60" : ""}`}>
                  <div>{n.message}</div>
                  <div className="text-xs opacity-70">{fmtDateTime(n.created_at, tz)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card lg:col-span-2">
          <h2 className="mb-3 font-semibold">연동 상태</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone={st.mode === "live" ? "green" : "violet"}>실행 모드: {st.mode === "live" ? "실제 운영" : "모의"}</Badge>
            <Badge tone={st.supabase ? "green" : "slate"}>Supabase {st.supabase ? "연결" : "미설정"}</Badge>
            <Badge tone={st.claude ? "green" : "slate"}>Claude API {st.claude ? "설정됨" : "미설정"}</Badge>
            <Badge tone={account.connected ? "green" : "slate"}>
              Threads {account.connected ? `@${account.username ?? "연결됨"}` : account.mock ? "모의 발행" : "미연결"}
            </Badge>
            <Badge tone={st.coupang ? "green" : "slate"}>쿠팡 파트너스 API {st.coupang ? "설정됨" : "미설정(수동 링크)"}</Badge>
            <Badge tone={st.cron ? "green" : "slate"}>예약 실행 {st.cron ? "CRON_SECRET 설정" : "미설정"}</Badge>
          </div>
          <Link href="/settings" className="mt-3 inline-block text-sm text-brand-600">설정 및 연결 방법 →</Link>
        </section>
      </div>
    </>
  );
}
