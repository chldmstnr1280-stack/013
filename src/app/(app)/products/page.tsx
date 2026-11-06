import Link from "next/link";
import { Badge, Empty, Flash, flash, MockBadge, PageHeader, type SP } from "@/components/ui";
import { getCtx } from "@/lib/ctx";
import { won } from "@/lib/text";
import { IMAGE_RIGHTS_LABEL } from "@/lib/types";

export default async function ProductsPage({ searchParams }: { searchParams: SP }) {
  const { msg, err } = await flash(searchParams);
  const ctx = await getCtx();
  const [products, contents] = await Promise.all([
    ctx.store.list("products", { eq: { user_id: ctx.userId }, order: { column: "created_at", ascending: false } }),
    ctx.store.list("contents", { eq: { user_id: ctx.userId } }),
  ]);
  return (
    <>
      <PageHeader title="상품 관리" desc="홍보할 쿠팡 파트너스 상품을 등록합니다. 확인된 정보만 입력하세요." actions={<Link href="/products/new" className="btn-primary">+ 상품 등록</Link>} />
      <Flash msg={msg} err={err} />
      {products.length === 0 ? (
        <Empty href="/products/new" cta="첫 상품 등록">등록된 상품이 없습니다.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => {
            const n = contents.filter((c) => c.product_id === p.id);
            return (
              <Link key={p.id} href={`/products/${p.id}`} className="card block hover:border-brand-500">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{p.name}</h2>
                  <MockBadge show={p.is_mock} />
                </div>
                <div className="mt-1 text-sm text-slate-500">{p.category || "카테고리 없음"} · {p.price === null ? "가격 미확인" : won(p.price)}</div>
                <div className="mt-3 flex flex-wrap gap-1">
                  <Badge tone={p.affiliate_url ? "green" : "red"}>{p.affiliate_url ? "제휴 링크 있음" : "제휴 링크 없음"}</Badge>
                  <Badge tone={p.image_rights === "unknown" ? "amber" : "slate"}>이미지: {IMAGE_RIGHTS_LABEL[p.image_rights]}</Badge>
                  <Badge>콘텐츠 {n.length}</Badge>
                </div>
                <div className="mt-2 text-xs text-slate-400">정보 확인일 {p.info_verified_at ?? "미입력"}</div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
