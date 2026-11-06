import Link from "next/link";
import { notFound } from "next/navigation";
import { publishNowAction, recheckContent, saveConfirmations, scheduleAction, setContentStatus, updateContent } from "@/app/actions";
import { CheckItem } from "@/components/checks";
import { CountedTextarea } from "@/components/counted-textarea";
import { Submit } from "@/components/submit";
import { ContentStatusBadge, Flash, flash, fmtDateTime, JobStatusBadge, MockBadge, PageHeader, type SP } from "@/components/ui";
import { getCtx } from "@/lib/ctx";
import { appMode } from "@/lib/env";
import { canApprove, CHECK_KEYS, CHECK_LABELS } from "@/lib/review";
import { addDays, localDate, normalizeTimes } from "@/lib/schedule";
import { getSettings } from "@/lib/settings";
import { contentTypeLabel, IMAGE_RIGHTS_LABEL, THREADS_MAX_CHARS } from "@/lib/types";

export default async function ReviewDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const { msg, err } = await flash(searchParams);
  const ctx = await getCtx();
  const c = await ctx.store.get("contents", id);
  if (!c || c.user_id !== ctx.userId) notFound();
  const [product, jobs, settings] = await Promise.all([
    ctx.store.get("products", c.product_id),
    ctx.store.list("publish_jobs", { eq: { content_id: c.id }, order: { column: "created_at", ascending: false } }),
    getSettings(ctx.store, ctx.userId),
  ]);
  const locked = c.status === "scheduled" || c.status === "published";
  const gate = canApprove(c.review);
  const mode = appMode();
  const today = localDate(new Date(), settings.timezone);
  const times = normalizeTimes(settings.posting_times);
  const back = `/review/${c.id}`;

  return (
    <>
      <PageHeader
        title="콘텐츠 검토"
        desc={
          <span className="flex flex-wrap items-center gap-1">
            <ContentStatusBadge s={c.status} /> {contentTypeLabel(c.content_type)} ·{" "}
            <Link href={`/products/${c.product_id}`} className="underline">{product?.name}</Link> · 추적코드 <code>{c.tracking_code}</code>
            <MockBadge show={c.is_mock || Boolean(c.generation.mock)} />
          </span>
        }
        actions={<Link href="/review" className="btn-secondary">목록</Link>}
      />
      <Flash msg={msg} err={err} />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <form action={updateContent} className="card space-y-4">
            <input type="hidden" name="id" value={c.id} />
            <div>
              <label className="label" htmlFor="body">본문</label>
              <CountedTextarea id="body" name="body" defaultValue={c.body} max={THREADS_MAX_CHARS} rows={10} disabled={locked} />
            </div>
            <div>
              <label className="label" htmlFor="reply_text">제휴 링크 답글 (게시 직후 내 게시물에 답글로 작성)</label>
              <CountedTextarea id="reply_text" name="reply_text" defaultValue={c.reply_text} max={THREADS_MAX_CHARS} rows={4} disabled={locked} />
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="use_image" defaultChecked={Boolean(c.image_url)} disabled={locked} /> 이미지 포함
              </label>
              <input name="image_url" defaultValue={c.image_url ?? product?.image_url ?? ""} className="input mt-2" placeholder="공개 https 이미지 URL" disabled={locked} />
              <p className="mt-1 text-xs text-slate-500">상품 이미지 권한: {product ? IMAGE_RIGHTS_LABEL[product.image_rights] : "—"}</p>
            </div>
            {c.generation.angle && <p className="text-xs text-slate-500">생성 관점: {c.generation.angle} · 모델: {c.generation.model}</p>}
            {!locked && (
              <div className="flex justify-end">
                <Submit>수정 저장 및 재검사</Submit>
              </div>
            )}
            {locked && <p className="text-sm text-slate-500">예약/발행된 콘텐츠는 수정할 수 없습니다. 예약 캘린더에서 예약을 취소하면 수정할 수 있습니다.</p>}
          </form>

          {jobs.length > 0 && (
            <section className="card">
              <h2 className="mb-2 font-semibold">발행 작업</h2>
              <ul className="space-y-1 text-sm">
                {jobs.map((j) => (
                  <li key={j.id} className="flex flex-wrap items-center gap-2">
                    <JobStatusBadge s={j.status} /> {fmtDateTime(j.scheduled_at, settings.timezone)}
                    {j.last_error && <span className="text-red-600">{j.last_error}</span>}
                    {j.permalink && <a href={j.permalink} target="_blank" rel="noreferrer" className="text-brand-600 underline">게시물 보기</a>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-4 lg:col-span-2">
          <section className="card space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">자동 검사</h2>
              <form action={recheckContent}>
                <input type="hidden" name="id" value={c.id} />
                <Submit className="btn-secondary text-xs">링크 확인 포함 재검사</Submit>
              </form>
            </div>
            {c.review.checks?.map((ch) => <CheckItem key={ch.key} c={ch} />) ?? <p className="muted">아직 검사하지 않았습니다.</p>}
            {c.review.checked_at && <p className="text-xs text-slate-400">검사 시각 {fmtDateTime(c.review.checked_at, settings.timezone)}</p>}
          </section>

          <form action={saveConfirmations} className="card space-y-3">
            <input type="hidden" name="id" value={c.id} />
            <h2 className="font-semibold">사람 확인 체크리스트</h2>
            <p className="text-xs text-slate-500">자동 검사는 보조 수단입니다. 각 항목을 직접 확인한 뒤 체크하세요. 6개 모두 체크 + 자동 검사 &apos;수정 필요&apos; 0개일 때 승인할 수 있습니다.</p>
            {CHECK_KEYS.map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={`confirm_${k}`} defaultChecked={Boolean(c.review.confirmed?.[k])} disabled={locked} />
                {CHECK_LABELS[k]} 확인함
              </label>
            ))}
            <textarea name="reviewer_note" rows={2} className="input" placeholder="검토 메모 (선택)" defaultValue={c.review.reviewer_note ?? ""} disabled={locked} />
            {!locked && (
              <div className="flex flex-wrap gap-2">
                <Submit className="btn-secondary" name="intent" value="save">체크 저장</Submit>
                <Submit className="btn-primary" name="intent" value="approve">체크 저장 후 승인</Submit>
              </div>
            )}
            {!gate.ok && !locked && c.status !== "approved" && (
              <ul className="list-disc pl-5 text-xs text-slate-500">
                {gate.reasons.slice(0, 4).map((r) => <li key={r}>{r}</li>)}
              </ul>
            )}
          </form>

          {c.status === "approved" && (
            <section className="card space-y-3">
              <h2 className="font-semibold">발행</h2>
              <form action={scheduleAction} className="space-y-2">
                <input type="hidden" name="content_id" value={c.id} />
                <input type="hidden" name="back" value={back} />
                <Submit className="btn-primary w-full">다음 빈 슬롯에 예약</Submit>
              </form>
              <form action={scheduleAction} className="space-y-2">
                <input type="hidden" name="content_id" value={c.id} />
                <input type="hidden" name="back" value={back} />
                <div className="flex gap-2">
                  <input type="date" name="date" min={today} max={addDays(today, 60)} defaultValue={today} className="input" required />
                  <select name="time" className="input" defaultValue={times[0]}>
                    {times.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <Submit className="btn-secondary w-full">지정 시간에 예약</Submit>
              </form>
              <form action={publishNowAction}>
                <input type="hidden" name="content_id" value={c.id} />
                <input type="hidden" name="back" value={back} />
                <Submit className="btn-secondary w-full" confirm={mode === "mock" ? "모의 발행합니다 (실제 게시 안 됨)." : "지금 실제 Threads 계정에 게시합니다. 계속할까요?"}>
                  {mode === "mock" ? "테스트 발행 (모의)" : "지금 발행 (테스트)"}
                </Submit>
              </form>
            </section>
          )}

          {!locked && (
            <section className="card flex flex-wrap gap-2">
              {c.status !== "rejected" && (
                <form action={setContentStatus}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="to" value="rejected" />
                  <Submit className="btn-danger">반려</Submit>
                </form>
              )}
              {(c.status === "approved" || c.status === "rejected" || c.status === "failed") && (
                <form action={setContentStatus}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="to" value="draft" />
                  <Submit className="btn-secondary">초안으로</Submit>
                </form>
              )}
              <form action={setContentStatus}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="to" value="delete" />
                <input type="hidden" name="back" value="/review" />
                <Submit className="btn-danger" confirm="이 콘텐츠를 삭제할까요?">삭제</Submit>
              </form>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
