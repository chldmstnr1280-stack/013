import Link from "next/link";
import { addReferencePost, deleteReferencePost, generateContents } from "@/app/actions";
import { Submit } from "@/components/submit";
import { Empty, Flash, flash, MockBadge, PageHeader, type SP } from "@/components/ui";
import { getCtx } from "@/lib/ctx";
import { appMode, integrationStatus } from "@/lib/env";
import { CONTENT_TYPES } from "@/lib/types";

export default async function GeneratePage({ searchParams }: { searchParams: SP }) {
  const { msg, err, params } = await flash(searchParams);
  const ctx = await getCtx();
  const [products, refs] = await Promise.all([
    ctx.store.list("products", { eq: { user_id: ctx.userId }, order: { column: "created_at", ascending: false } }),
    ctx.store.list("reference_posts", { eq: { user_id: ctx.userId }, order: { column: "created_at", ascending: false } }),
  ]);
  const st = integrationStatus();
  const mode = appMode();
  const selected = typeof params.product === "string" ? params.product : products[0]?.id;
  const blocked = mode === "live" && !st.claude;

  return (
    <>
      <PageHeader
        title="AI 콘텐츠 생성"
        desc={mode === "mock" ? "모의 모드: Claude 를 호출하지 않고 템플릿으로 [모의 생성] 초안을 만듭니다." : `Claude (${st.claudeModel}) 로 서로 다른 관점의 Threads 글 3개를 만듭니다.`}
      />
      <Flash msg={msg} err={err} />
      {blocked && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ANTHROPIC_API_KEY 가 설정되지 않아 생성할 수 없습니다. <Link href="/settings" className="underline">설정 안내</Link>
        </div>
      )}
      {products.length === 0 ? (
        <Empty href="/products/new" cta="상품 등록">먼저 상품을 등록하세요.</Empty>
      ) : (
        <form action={generateContents} className="card space-y-5">
          <div>
            <label className="label" htmlFor="product_id">상품 선택</label>
            <select id="product_id" name="product_id" defaultValue={selected} className="input">
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.features.length === 0 ? "(특징 미입력)" : ""}
                </option>
              ))}
            </select>
          </div>
          <fieldset>
            <legend className="label">콘텐츠 유형 (3개 선택 · 적게 고르면 나머지는 자동으로 채움)</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {CONTENT_TYPES.map((t, i) => (
                <label key={t.value} className="flex cursor-pointer gap-2 rounded-lg border border-slate-200 p-3 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                  <input type="checkbox" name="types" value={t.value} defaultChecked={i < 3} className="mt-0.5" />
                  <span>
                    <span className="font-medium">{t.label}</span>
                    <span className="block text-xs text-slate-500">{t.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="extra">추가 요청 (선택)</label>
            <input id="extra" name="extra" className="input" placeholder="예: 1인 가구 관점으로, 겨울철 상황 위주로" />
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            생성 규칙: 사용 후기·구매 경험을 지어내지 않음 · 등록되지 않은 가격/할인율/효능/판매량 금지 · 과장 표현 금지 ·
            본문 끝에 광고 표시 자동 추가 · 제휴 링크와 수수료 안내는 답글로 분리. 생성 직후 자동 검사가 실행되며, 사람이 승인해야만 발행됩니다.
          </div>
          <div className="flex justify-end">
            <Submit pending="생성 중… (최대 1분)" className="btn-primary">{mode === "mock" ? "모의 초안 3개 생성" : "초안 3개 생성"}</Submit>
          </div>
        </form>
      )}

      <section className="card mt-6">
        <h2 className="font-semibold">내 기존 게시물 (말투 참고 자료)</h2>
        <p className="muted mb-3">직접 쓴 Threads 글을 등록하면 AI 가 말투를 참고합니다. 중복 검사에도 사용됩니다.</p>
        <form action={addReferencePost} className="mb-4 space-y-2">
          <input type="hidden" name="back" value="/generate" />
          <textarea name="body" rows={3} className="input" placeholder="내가 직접 쓴 게시물을 붙여 넣으세요" required />
          <div className="flex gap-2">
            <input name="note" className="input" placeholder="메모 (선택)" />
            <Submit className="btn-secondary shrink-0">등록</Submit>
          </div>
        </form>
        {refs.length === 0 ? (
          <p className="muted">등록된 참고 게시물이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {refs.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm">
                <div className="min-w-0 whitespace-pre-line">
                  {r.body}
                  {r.note && <div className="mt-1 text-xs text-slate-500">{r.note}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <MockBadge show={r.is_mock} />
                  <form action={deleteReferencePost}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="back" value="/generate" />
                    <Submit className="text-xs text-red-600 hover:underline" confirm="삭제할까요?">삭제</Submit>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
