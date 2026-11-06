import Link from "next/link";
import { cancelJobAction, rescheduleAction, runDueNowAction, scheduleAction, togglePause } from "@/app/actions";
import { Submit } from "@/components/submit";
import { Badge, Flash, flash, JobStatusBadge, MockBadge, PageHeader, type SP } from "@/components/ui";
import { getCtx } from "@/lib/ctx";
import { addDays, countOnDay, effectiveLimit, localDate, localTime, nextFreeSlot, normalizeTimes } from "@/lib/schedule";
import { getSettings } from "@/lib/settings";
import { contentTypeLabel } from "@/lib/types";

const DAYS = 14;

export default async function CalendarPage({ searchParams }: { searchParams: SP }) {
  const { msg, err } = await flash(searchParams);
  const ctx = await getCtx();
  const [settings, jobs, contents, products] = await Promise.all([
    getSettings(ctx.store, ctx.userId),
    ctx.store.list("publish_jobs", { eq: { user_id: ctx.userId }, order: { column: "scheduled_at", ascending: true } }),
    ctx.store.list("contents", { eq: { user_id: ctx.userId } }),
    ctx.store.list("products", { eq: { user_id: ctx.userId } }),
  ]);
  const tz = settings.timezone;
  const limit = effectiveLimit(settings);
  const times = normalizeTimes(settings.posting_times);
  const today = localDate(new Date(), tz);
  const contentById = new Map(contents.map((c) => [c.id, c]));
  const pName = new Map(products.map((p) => [p.id, p.name]));
  const approved = contents.filter((c) => c.status === "approved");
  const next = nextFreeSlot(jobs, settings);
  const active = jobs.filter((j) => j.status !== "cancelled");

  return (
    <>
      <PageHeader
        title="예약 캘린더"
        desc={`하루 최대 ${limit}개 · 게시 시간 ${times.join(", ")} (${tz}) · 다음 빈 슬롯 ${next ? `${localDate(next, tz)} ${localTime(next, tz)}` : "없음"}`}
        actions={
          <>
            <form action={togglePause}>
              <Submit className={settings.autopublish_paused ? "btn-primary" : "btn-danger"}>
                {settings.autopublish_paused ? "▶ 자동 발행 재개" : "⏸ 자동 발행 일시 정지"}
              </Submit>
            </form>
            <form action={runDueNowAction}>
              <Submit className="btn-secondary">예약 처리 지금 실행</Submit>
            </form>
          </>
        }
      />
      <Flash msg={msg} err={err} />
      {settings.autopublish_paused && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          자동 발행이 일시 정지되었습니다. 예약은 유지되지만 시간이 되어도 발행되지 않습니다. (재개하면 지난 예약부터 순서대로 발행됩니다)
        </div>
      )}

      <section className="card mb-6">
        <h2 className="mb-3 font-semibold">승인된 콘텐츠 예약하기 ({approved.length})</h2>
        {approved.length === 0 ? (
          <p className="muted">
            예약할 승인 콘텐츠가 없습니다. <Link href="/review" className="text-brand-600 underline">콘텐츠 승인</Link>
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {approved.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center lg:justify-between">
                <Link href={`/review/${c.id}`} className="min-w-0 text-sm hover:underline">
                  <span className="text-slate-500">[{contentTypeLabel(c.content_type)}] {pName.get(c.product_id)}</span>
                  <span className="block truncate">{c.body.split("\n")[0]}</span>
                </Link>
                <div className="flex flex-wrap gap-2">
                  <form action={scheduleAction}>
                    <input type="hidden" name="content_id" value={c.id} />
                    <Submit className="btn-primary text-xs">다음 빈 슬롯</Submit>
                  </form>
                  <form action={scheduleAction} className="flex gap-1">
                    <input type="hidden" name="content_id" value={c.id} />
                    <input type="date" name="date" min={today} defaultValue={today} className="input w-36 py-1 text-xs" required />
                    <select name="time" className="input w-24 py-1 text-xs">
                      {times.map((t) => <option key={t}>{t}</option>)}
                    </select>
                    <Submit className="btn-secondary text-xs">예약</Submit>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: DAYS }, (_, i) => addDays(today, i)).map((day) => {
          const dayJobs = active.filter((j) => localDate(j.scheduled_at, tz) === day);
          const used = countOnDay(jobs, day, tz);
          const weekday = new Date(`${day}T12:00:00Z`).toLocaleDateString("ko-KR", { weekday: "short", timeZone: "UTC" });
          return (
            <section key={day} className={`card ${day === today ? "ring-2 ring-brand-100" : ""}`}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold">{day.slice(5).replace("-", "/")} ({weekday}){day === today && " · 오늘"}</h3>
                <Badge tone={used >= limit ? "red" : "slate"}>{used}/{limit}</Badge>
              </div>
              {dayJobs.length === 0 ? (
                <p className="text-xs text-slate-400">예약 없음</p>
              ) : (
                <ul className="space-y-2">
                  {dayJobs.map((j) => {
                    const c = contentById.get(j.content_id);
                    return (
                      <li key={j.id} className="rounded-lg bg-slate-50 p-2 text-sm">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs">{localTime(j.scheduled_at, tz)}</span>
                          <JobStatusBadge s={j.status} />
                          <MockBadge show={j.is_mock} />
                        </div>
                        <Link href={`/review/${j.content_id}`} className="mt-1 block truncate text-xs hover:underline">{c?.body.split("\n")[0] ?? "(삭제된 콘텐츠)"}</Link>
                        {j.last_error && <p className="mt-1 text-xs text-red-600">{j.last_error}</p>}
                        {j.status === "pending" && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs text-brand-600">변경/취소</summary>
                            <form action={rescheduleAction} className="mt-1 flex gap-1">
                              <input type="hidden" name="job_id" value={j.id} />
                              <input type="date" name="date" min={today} defaultValue={day} className="input py-1 text-xs" required />
                              <select name="time" className="input py-1 text-xs" defaultValue={localTime(j.scheduled_at, tz)}>
                                {[...new Set([...times, localTime(j.scheduled_at, tz)])].sort().map((t) => <option key={t}>{t}</option>)}
                              </select>
                              <Submit className="btn-secondary px-2 py-1 text-xs">변경</Submit>
                            </form>
                            <form action={cancelJobAction} className="mt-1">
                              <input type="hidden" name="job_id" value={j.id} />
                              <Submit className="text-xs text-red-600 hover:underline" confirm="예약을 취소할까요?">예약 취소</Submit>
                            </form>
                          </details>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-slate-500">
        예약 실행은 서버 Cron(/api/cron/publish, 5분 간격 권장)이 담당합니다. 로컬/모의 모드에서는 &apos;예약 처리 지금 실행&apos; 버튼으로 시험할 수 있습니다.
      </p>
    </>
  );
}
