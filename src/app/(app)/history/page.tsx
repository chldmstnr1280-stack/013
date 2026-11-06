import Link from "next/link";
import { retryJobAction } from "@/app/actions";
import { Submit } from "@/components/submit";
import { Badge, Empty, Flash, flash, fmtDateTime, JobStatusBadge, MockBadge, PageHeader, type SP } from "@/components/ui";
import { getCtx, systemStore } from "@/lib/ctx";
import { getSettings } from "@/lib/settings";
import type { ApiLog, JobStatus } from "@/lib/types";

const FILTERS: (JobStatus | "all")[] = ["all", "published", "pending", "failed", "cancelled"];
const LABEL: Record<string, string> = { all: "전체", published: "발행 완료", pending: "대기", failed: "실패", cancelled: "취소" };

export default async function HistoryPage({ searchParams }: { searchParams: SP }) {
  const { msg, err, params } = await flash(searchParams);
  const filter = (typeof params.status === "string" ? params.status : "all") as JobStatus | "all";
  const ctx = await getCtx();
  const [jobs, contents, settings] = await Promise.all([
    ctx.store.list("publish_jobs", { eq: { user_id: ctx.userId }, order: { column: "scheduled_at", ascending: false } }),
    ctx.store.list("contents", { eq: { user_id: ctx.userId } }),
    getSettings(ctx.store, ctx.userId),
  ]);
  let logs: ApiLog[] = [];
  try {
    // live: RLS 로 본인 로그만 조회 / mock: 로컬 파일
    logs = await (ctx.store.mode === "mock" ? systemStore() : ctx.store).list("api_logs", {
      eq: { user_id: ctx.userId },
      order: { column: "created_at", ascending: false },
      limit: 30,
    });
  } catch {
    logs = [];
  }
  const tz = settings.timezone;
  const byId = new Map(contents.map((c) => [c.id, c]));
  const rows = filter === "all" ? jobs : jobs.filter((j) => j.status === filter);

  return (
    <>
      <PageHeader title="발행 기록" desc="게시물별 발행 상태, 오류, 답글(제휴 링크) 결과를 확인합니다." />
      <Flash msg={msg} err={err} />
      <div className="mb-4 flex gap-1 overflow-x-auto">
        {FILTERS.map((f) => (
          <Link key={f} href={`/history?status=${f}`} className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${filter === f ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
            {LABEL[f]} {f === "all" ? jobs.length : jobs.filter((j) => j.status === f).length}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty>기록이 없습니다.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0 sm:p-0">
          <table className="data-table min-w-[720px]">
            <thead>
              <tr>
                <th>예약 시각</th>
                <th>콘텐츠</th>
                <th>상태</th>
                <th>시도</th>
                <th>답글</th>
                <th>결과 / 오류</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => {
                const c = byId.get(j.content_id);
                return (
                  <tr key={j.id}>
                    <td className="whitespace-nowrap">
                      {fmtDateTime(j.scheduled_at, tz)}
                      {j.published_at && <div className="text-xs text-slate-500">발행 {fmtDateTime(j.published_at, tz)}</div>}
                    </td>
                    <td className="max-w-xs">
                      <Link href={`/review/${j.content_id}`} className="line-clamp-2 hover:underline">{c?.body.split("\n")[0] ?? "(삭제됨)"}</Link>
                    </td>
                    <td><span className="flex gap-1"><JobStatusBadge s={j.status} /><MockBadge show={j.is_mock} /></span></td>
                    <td className="tabular-nums">{j.attempts}/{j.max_attempts}</td>
                    <td>
                      {j.threads_reply_id ? <Badge tone="green">작성됨</Badge> : j.reply_error ? <Badge tone="red">실패</Badge> : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    <td className="max-w-sm text-xs">
                      {j.permalink && <a href={j.permalink} target="_blank" rel="noreferrer" className="text-brand-600 underline">Threads 에서 보기</a>}
                      {j.threads_media_id && !j.permalink && <span className="text-slate-500">media {j.threads_media_id}</span>}
                      {j.status === "pending" && j.next_attempt_at && <div className="text-amber-700">재시도 예정 {fmtDateTime(j.next_attempt_at, tz)}</div>}
                      {j.last_error && <div className="text-red-600">{j.last_error}</div>}
                      {j.reply_error && <div className="text-red-600">답글: {j.reply_error}</div>}
                      {j.status === "failed" && (
                        <form action={retryJobAction} className="mt-1">
                          <input type="hidden" name="job_id" value={j.id} />
                          <Submit className="btn-secondary px-2 py-1 text-xs" confirm="Threads 에 이미 게시되지 않았는지 확인했나요? 지금 다시 시도합니다.">재시도</Submit>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <section className="card mt-6">
        <h2 className="mb-2 font-semibold">최근 API 기록</h2>
        {logs.length === 0 ? (
          <p className="muted">기록이 없습니다.</p>
        ) : (
          <ul className="space-y-1 break-all font-mono text-xs">
            {logs.map((l) => (
              <li key={l.id} className={l.ok ? "text-slate-600" : "text-red-600"}>
                {fmtDateTime(l.created_at, tz)} [{l.provider}] {l.action} {l.ok ? "OK" : "FAIL"}
                {l.status_code ? ` (${l.status_code})` : ""} {l.message ? `— ${l.message.slice(0, 160)}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
