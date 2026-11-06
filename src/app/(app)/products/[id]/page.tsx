import Link from "next/link";
import { notFound } from "next/navigation";
import { createAffiliateLink, deleteProduct } from "@/app/actions";
import { ProductForm } from "@/components/product-form";
import { Submit } from "@/components/submit";
import { ContentStatusBadge, Flash, flash, MockBadge, PageHeader, type SP } from "@/components/ui";
import { getCtx } from "@/lib/ctx";
import { integrationStatus } from "@/lib/env";
import { contentTypeLabel } from "@/lib/types";

export default async function ProductDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const { msg, err } = await flash(searchParams);
  const ctx = await getCtx();
  const p = await ctx.store.get("products", id);
  if (!p || p.user_id !== ctx.userId) notFound();
  const contents = await ctx.store.list("contents", { eq: { product_id: id }, order: { column: "created_at", ascending: false } });
  const st = integrationStatus();
  return (
    <>
      <PageHeader
        title={p.name}
        desc={<>상품 정보 수정 <MockBadge show={p.is_mock} /></>}
        actions={<Link href={`/generate?product=${p.id}`} className="btn-primary">이 상품으로 콘텐츠 생성</Link>}
      />
      <Flash msg={msg} err={err} />
      <ProductForm p={p} />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-2 font-semibold">제휴 링크 자동 생성 (쿠팡 파트너스 Open API)</h2>
          {st.coupang ? (
            <form action={createAffiliateLink}>
              <input type="hidden" name="id" value={p.id} />
              <p className="muted mb-2">쿠팡 상품 URL 로 공식 딥링크 API 를 호출해 제휴 링크를 만듭니다.</p>
              <Submit className="btn-secondary">제휴 링크 생성</Submit>
            </form>
          ) : (
            <p className="muted">
              API 키가 없어 비활성화되었습니다. 쿠팡 파트너스 최종 승인 후 발급받은 Access/Secret Key 를 서버 환경 변수에 설정하면 사용할 수 있습니다.
              그 전에는 파트너스 웹사이트에서 만든 링크를 직접 붙여 넣으세요.
            </p>
          )}
        </section>
        <section className="card">
          <h2 className="mb-2 font-semibold">삭제</h2>
          <form action={deleteProduct}>
            <input type="hidden" name="id" value={p.id} />
            <p className="muted mb-2">상품과 연결된 콘텐츠도 함께 삭제됩니다.</p>
            <Submit className="btn-danger" confirm="정말 삭제할까요? 연결된 콘텐츠도 삭제됩니다.">상품 삭제</Submit>
          </form>
        </section>
      </div>

      <section className="card mt-4">
        <h2 className="mb-3 font-semibold">이 상품의 콘텐츠 ({contents.length})</h2>
        {contents.length === 0 ? (
          <p className="muted">아직 생성된 콘텐츠가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {contents.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Link href={`/review/${c.id}`} className="min-w-0 truncate hover:underline">
                  <span className="text-slate-500">[{contentTypeLabel(c.content_type)}]</span> {c.body.split("\n")[0]}
                </Link>
                <ContentStatusBadge s={c.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
