import Link from "next/link";
import { deleteImportBatch, importMetricsCsv, refreshInsightsAction } from "@/app/actions";
import { Submit } from "@/components/submit";
import { Flash, flash, fmtDateTime, MockBadge, PageHeader, SourceBadges, Stat, type SP } from "@/components/ui";
import { buildAnalytics, ratio, type Perf } from "@/lib/analytics";
import { getCtx } from "@/lib/ctx";
import { num, won } from "@/lib/text";
import { contentTypeLabel } from "@/lib/types";

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

function PerfCells({ p }: { p: Perf }) {
  return (
    <>
      <td className="tabular-nums">{num(p.views)}</td>
      <td className="tabular-nums">{num(p.reactions)}</td>
      <td className="tabular-nums">{num(p.replies)}</td>
      <td className="tabular-nums">{num(p.clicks)}</td>
      <td className="tabular-nums">{num(p.orders)}</td>
      <td className="tabular-nums">{won(p.commission)}</td>
      <td><SourceBadges sources={p.sources} /></td>
    </>
  );
}
const HEAD = ["조회수", "반응", "답글", "클릭", "구매", "수수료", "출처"];

export default async function AnalyticsPage({ searchParams }: { searchParams: SP }) {
  const { msg, err } = await flash(searchParams);
  const ctx = await getCtx();
  const eq = { eq: { user_id: ctx.userId } };
  const [products, contents, jobs, insights, metrics] = await Promise.all([
    ctx.store.list("products", eq),
    ctx.store.list("contents", eq),
    ctx.store.list("publish_jobs", eq),
    ctx.store.list("post_insights", eq),
    ctx.store.list("affiliate_metrics", eq),
  ]);
  const a = buildAnalytics({ products, contents, jobs, insights, metrics });
  const batches = [...new Map(metrics.filter((m) => m.import_batch).map((m) => [m.import_batch!, m])).values()];
  const hasMock = a.total.sources.includes("mock");

  return (
    <>
      <PageHeader
        title="수익 분석"
        desc="'—' 는 측정되지 않은 값입니다. 추정치를 실제 수치처럼 표시하지 않습니다."
        actions={
          <form action={refreshInsightsAction}>
            <Submit className="btn-secondary">Threads 인사이트 갱신</Submit>
          </form>
        }
      />
      <Flash msg={msg} err={err} />
      {hasMock && (
        <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-800">
          아래 수치에 <strong>모의 데이터</strong>가 포함되어 있습니다. 실제 성과가 아닙니다.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="발행 게시물" value={a.total.posts} />
        <Stat label="조회수" value={num(a.total.views)} hint="출처: Threads 인사이트" />
        <Stat label="반응 (좋아요+리포스트+인용)" value={num(a.total.reactions)} />
        <Stat label="답글" value={num(a.total.replies)} />
        <Stat label="제휴 링크 클릭" value={num(a.total.clicks)} hint="출처: 쿠팡 파트너스 리포트(CSV)" />
        <Stat label="구매 전환" value={num(a.total.orders)} hint={`클릭 대비 ${pct(ratio(a.total.orders, a.total.clicks))}`} />
        <Stat label="발생 수수료" value={won(a.total.commission)} />
        <Stat label="조회 대비 클릭" value={pct(ratio(a.total.clicks, a.total.views))} hint="게시물 연결 데이터 기준 아님(전체 합)" />
      </div>

      <section className="card mt-6 overflow-x-auto">
        <h2 className="mb-3 font-semibold">상품별 성과</h2>
        <table className="data-table min-w-[760px]">
          <thead><tr><th>상품</th><th>게시물</th>{HEAD.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {a.byProduct.length === 0 ? (
              <tr><td colSpan={9} className="text-slate-400">데이터 없음</td></tr>
            ) : (
              a.byProduct.map((r) => (
                <tr key={r.product.id}>
                  <td><Link href={`/products/${r.product.id}`} className="hover:underline">{r.product.name}</Link></td>
                  <td>{r.posts}</td>
                  <PerfCells p={r} />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="card mt-4 overflow-x-auto">
        <h2 className="mb-3 font-semibold">콘텐츠 유형별 성과</h2>
        <table className="data-table min-w-[760px]">
          <thead><tr><th>유형</th><th>게시물</th>{HEAD.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {a.byType.length === 0 ? (
              <tr><td colSpan={9} className="text-slate-400">데이터 없음</td></tr>
            ) : (
              a.byType.map((r) => (
                <tr key={r.type}>
                  <td>{contentTypeLabel(r.type)}</td>
                  <td>{r.posts}</td>
                  <PerfCells p={r} />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="card mt-4 overflow-x-auto">
        <h2 className="mb-3 font-semibold">게시물별 성과</h2>
        <table className="data-table min-w-[900px]">
          <thead><tr><th>발행</th><th>게시물</th><th>추적코드</th>{HEAD.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {a.posts.length === 0 ? (
              <tr><td colSpan={10} className="text-slate-400">발행된 게시물이 없습니다.</td></tr>
            ) : (
              a.posts.map((r) => (
                <tr key={r.job.id}>
                  <td className="whitespace-nowrap">{fmtDateTime(r.job.published_at)}</td>
                  <td className="max-w-xs">
                    <Link href={`/review/${r.content.id}`} className="line-clamp-2 hover:underline">{r.content.body.split("\n")[0]}</Link>
                    <span className="text-xs text-slate-500">{contentTypeLabel(r.content.content_type)} <MockBadge show={r.job.is_mock} /></span>
                  </td>
                  <td><code className="text-xs">{r.content.tracking_code}</code></td>
                  <PerfCells p={r} />
                </tr>
              ))
            )}
          </tbody>
        </table>
        {(a.unattributed.clicks !== null || a.unattributed.commission !== null) && (
          <p className="mt-2 text-xs text-slate-500">
            게시물·상품과 연결되지 않은 실적: 클릭 {num(a.unattributed.clicks)} · 구매 {num(a.unattributed.orders)} · 수수료 {won(a.unattributed.commission)}
          </p>
        )}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="font-semibold">제휴 실적 CSV 업로드</h2>
          <p className="muted mb-3">
            Threads 는 링크 클릭·구매 데이터를 제공하지 않습니다. 쿠팡 파트너스 리포트에서 내려받은 데이터를 아래 형식으로 업로드하세요.
            <code className="mx-1">sub_id</code> 에 게시물 추적코드를 넣으면 게시물별로 연결됩니다. 빈 칸은 0 이 아니라 &apos;측정 안 됨&apos; 으로 저장됩니다.
          </p>
          <form action={importMetricsCsv} className="flex flex-col gap-2 sm:flex-row">
            <input type="file" name="file" accept=".csv,text/csv" required className="input" />
            <Submit className="btn-primary shrink-0">업로드</Submit>
          </form>
          <a href="/api/metrics/template" className="mt-2 inline-block text-sm text-brand-600 underline">CSV 템플릿 내려받기</a>
          <p className="mt-2 text-xs text-slate-500">
            허용 열: date(날짜), sub_id(채널ID/추적코드), product(상품명), clicks(클릭수), orders(주문수), commission(수수료). 쿠팡 파트너스 딥링크 생성 시 subId 를 추적코드로 지정하면 정확히 연결됩니다.
          </p>
        </section>
        <section className="card">
          <h2 className="mb-2 font-semibold">가져온 데이터</h2>
          {batches.length === 0 ? (
            <p className="muted">가져온 데이터가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {batches.map((b) => (
                <li key={b.import_batch} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {b.import_batch} · {metrics.filter((m) => m.import_batch === b.import_batch).length}행 <SourceBadges sources={[b.source]} />
                  </span>
                  <form action={deleteImportBatch}>
                    <input type="hidden" name="batch" value={b.import_batch!} />
                    <Submit className="text-xs text-red-600 hover:underline" confirm="이 가져오기 데이터를 삭제할까요?">삭제</Submit>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
