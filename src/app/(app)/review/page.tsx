import Link from "next/link";
import { CheckSummary } from "@/components/checks";
import { ContentStatusBadge, Empty, Flash, flash, MockBadge, PageHeader, type SP } from "@/components/ui";
import { getCtx } from "@/lib/ctx";
import { contentTypeLabel, type ContentStatus } from "@/lib/types";

const TABS: { key: ContentStatus | "all"; label: string }[] = [
  { key: "draft", label: "검토 대기" },
  { key: "approved", label: "승인됨" },
  { key: "scheduled", label: "예약됨" },
  { key: "published", label: "발행됨" },
  { key: "rejected", label: "반려" },
  { key: "failed", label: "실패" },
  { key: "all", label: "전체" },
];

export default async function ReviewList({ searchParams }: { searchParams: SP }) {
  const { msg, err, params } = await flash(searchParams);
  const tab = (typeof params.status === "string" ? params.status : "draft") as ContentStatus | "all";
  const ctx = await getCtx();
  const [contents, products] = await Promise.all([
    ctx.store.list("contents", { eq: { user_id: ctx.userId }, order: { column: "created_at", ascending: false } }),
    ctx.store.list("products", { eq: { user_id: ctx.userId } }),
  ]);
  const pName = new Map(products.map((p) => [p.id, p.name]));
  const rows = tab === "all" ? contents : contents.filter((c) => c.status === tab);
  return (
    <>
      <PageHeader title="콘텐츠 승인" desc="AI 초안을 검토·수정하고 승인합니다. 승인되지 않은 게시물은 절대 발행되지 않습니다." actions={<Link href="/generate" className="btn-primary">새 초안 생성</Link>} />
      <Flash msg={msg} err={err} />
      <div className="mb-4 flex gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const n = t.key === "all" ? contents.length : contents.filter((c) => c.status === t.key).length;
          return (
            <Link key={t.key} href={`/review?status=${t.key}`} className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${tab === t.key ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
              {t.label} {n}
            </Link>
          );
        })}
      </div>
      {rows.length === 0 ? (
        <Empty>해당 상태의 콘텐츠가 없습니다.</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((c) => (
            <Link key={c.id} href={`/review/${c.id}`} className="card block hover:border-brand-500">
              <div className="mb-2 flex flex-wrap items-center gap-1 text-xs">
                <ContentStatusBadge s={c.status} />
                <span className="rounded-full bg-slate-100 px-2 py-0.5">{contentTypeLabel(c.content_type)}</span>
                <MockBadge show={c.is_mock || Boolean(c.generation.mock)} />
                <span className="ml-auto"><CheckSummary checks={c.review.checks} /></span>
              </div>
              <div className="mb-1 truncate text-xs text-slate-500">{pName.get(c.product_id)}</div>
              <p className="line-clamp-4 whitespace-pre-line text-sm">{c.body}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
