"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { createDeeplink } from "@/lib/coupang";
import { parseMetricsCsv } from "@/lib/csv";
import { getCtx } from "@/lib/ctx";
import { buildReply, POST_DISCLOSURE } from "@/lib/disclosure";
import { appMode } from "@/lib/env";
import { generatePosts } from "@/lib/generate";
import { checkLink } from "@/lib/linkcheck";
import { cancelJob, processDueJobs, refreshInsights, rescheduleJob, retryJob, scheduleContent } from "@/lib/publisher";
import { canApprove, CHECK_KEYS, runChecks } from "@/lib/review";
import { normalizeTimes, zonedToUtc } from "@/lib/schedule";
import { getSettings } from "@/lib/settings";
import type { Ctx } from "@/lib/store/types";
import { disconnectAccount } from "@/lib/threads-account";
import { contentHash, trackingCode } from "@/lib/text";
import { supabaseUserClient } from "@/lib/supabase/server";
import {
  CONTENT_TYPES,
  MAX_DAILY_LIMIT,
  type Content,
  type ContentType,
  type ImageRights,
  type Review,
} from "@/lib/types";

// ───────────── 공통 ─────────────
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const safeBack = (fd: FormData, fallback: string) => {
  const b = str(fd, "back");
  return b.startsWith("/") && !b.startsWith("//") ? b : fallback;
};

/** 작업 실행 후 메시지와 함께 돌아가기 (JS 없이도 동작하는 폼 패턴) */
async function run(back: string, fn: () => Promise<string | void>) {
  let msg: string | void = undefined;
  let err: string | null = null;
  try {
    msg = await fn();
  } catch (e) {
    unstable_rethrow(e);
    err = (e as Error).message || "알 수 없는 오류";
  }
  revalidatePath("/", "layout");
  const sep = back.includes("?") ? "&" : "?";
  redirect(err ? `${back}${sep}err=${encodeURIComponent(err)}` : msg ? `${back}${sep}msg=${encodeURIComponent(msg)}` : back);
}

async function ownContent(ctx: Ctx, id: string) {
  const c = await ctx.store.get("contents", id);
  if (!c || c.user_id !== ctx.userId) throw new Error("콘텐츠를 찾을 수 없습니다.");
  return c;
}

/** 자동 검사 재실행 후 review 저장 */
async function recheck(ctx: Ctx, c: Content, resetConfirm: boolean) {
  const product = await ctx.store.get("products", c.product_id);
  if (!product) throw new Error("상품을 찾을 수 없습니다.");
  const [contents, refs, settings] = await Promise.all([
    ctx.store.list("contents", { eq: { user_id: ctx.userId } }),
    ctx.store.list("reference_posts", { eq: { user_id: ctx.userId } }),
    getSettings(ctx.store, ctx.userId),
  ]);
  const others = [
    ...contents
      .filter((o) => o.id !== c.id && o.status !== "rejected")
      .map((o) => ({ label: `콘텐츠 ${o.tracking_code}`, body: o.body })),
    ...refs.map((r) => ({ label: "내 기존 게시물", body: r.body })),
  ];
  const checks = runChecks({
    body: c.body,
    reply_text: c.reply_text,
    image_url: c.image_url,
    product,
    others,
    requireReply: settings.post_affiliate_reply,
    link: c.review.link,
  });
  const review: Review = { ...c.review, checks, checked_at: new Date().toISOString(), ...(resetConfirm ? { confirmed: {} } : {}) };
  await ctx.store.update("contents", { id: c.id }, { review });
  return review;
}

// ───────────── 인증 ─────────────
export async function signIn(fd: FormData) {
  const sb = await supabaseUserClient();
  const { error } = await sb.auth.signInWithPassword({ email: str(fd, "email"), password: str(fd, "password") });
  if (error) redirect(`/login?err=${encodeURIComponent("로그인 실패: " + error.message)}`);
  redirect("/");
}

export async function signUp(fd: FormData) {
  const sb = await supabaseUserClient();
  const { error } = await sb.auth.signUp({ email: str(fd, "email"), password: str(fd, "password") });
  if (error) redirect(`/login?err=${encodeURIComponent("가입 실패: " + error.message)}`);
  redirect(`/login?msg=${encodeURIComponent("가입 요청 완료. 이메일 인증이 켜져 있다면 메일을 확인한 뒤 로그인하세요.")}`);
}

export async function signOut() {
  if (appMode() === "live") {
    const sb = await supabaseUserClient();
    await sb.auth.signOut();
  }
  redirect("/login");
}

// ───────────── 상품 ─────────────
export async function saveProduct(fd: FormData) {
  const id = str(fd, "id");
  await run(id ? `/products/${id}` : "/products", async () => {
    const ctx = await getCtx();
    const priceRaw = str(fd, "price").replace(/[,원\s]/g, "");
    const row = {
      name: str(fd, "name"),
      category: str(fd, "category"),
      price: priceRaw ? Number(priceRaw) : null,
      features: str(fd, "features").split("\n").map((s) => s.trim()).filter(Boolean),
      coupang_url: str(fd, "coupang_url"),
      affiliate_url: str(fd, "affiliate_url"),
      image_url: str(fd, "image_url") || null,
      image_rights: (str(fd, "image_rights") || "unknown") as ImageRights,
      info_verified_at: str(fd, "info_verified_at") || null,
      notes: str(fd, "notes"),
    };
    if (!row.name) throw new Error("상품명은 필수입니다.");
    if (row.price !== null && (!Number.isInteger(row.price) || row.price < 0)) throw new Error("가격은 0 이상의 정수(원)로 입력하세요.");
    for (const [k, v] of [["쿠팡 상품 URL", row.coupang_url], ["제휴 링크", row.affiliate_url], ["이미지 URL", row.image_url ?? ""]] as const) {
      if (v && !/^https?:\/\/\S+$/.test(v)) throw new Error(`${k} 형식이 올바르지 않습니다.`);
    }
    if (id) {
      const [u] = await ctx.store.update("products", { id, user_id: ctx.userId }, row);
      if (!u) throw new Error("상품을 찾을 수 없습니다.");
      return "상품 정보를 저장했습니다. 이 상품의 초안은 다시 검사하세요.";
    }
    await ctx.store.insert("products", [{ ...row, user_id: ctx.userId, is_mock: ctx.store.mode === "mock" }]);
    return "상품을 등록했습니다.";
  });
}

export async function deleteProduct(fd: FormData) {
  await run("/products", async () => {
    const ctx = await getCtx();
    const id = str(fd, "id");
    const jobs = await ctx.store.list("publish_jobs", { eq: { user_id: ctx.userId, status: "pending" } });
    const contents = await ctx.store.list("contents", { eq: { product_id: id } });
    if (jobs.some((j) => contents.some((c) => c.id === j.content_id))) throw new Error("예약된 게시물이 있는 상품은 삭제할 수 없습니다. 먼저 예약을 취소하세요.");
    await ctx.store.remove("products", { id, user_id: ctx.userId });
    return "상품을 삭제했습니다.";
  });
}

export async function createAffiliateLink(fd: FormData) {
  const id = str(fd, "id");
  await run(`/products/${id}`, async () => {
    const ctx = await getCtx();
    const p = await ctx.store.get("products", id);
    if (!p || p.user_id !== ctx.userId) throw new Error("상품을 찾을 수 없습니다.");
    if (!p.coupang_url) throw new Error("쿠팡 상품 URL 을 먼저 입력하세요.");
    if (appMode() === "mock") throw new Error("모의 모드에서는 쿠팡 API 를 호출하지 않습니다.");
    const url = await createDeeplink(ctx.userId, p.coupang_url);
    await ctx.store.update("products", { id }, { affiliate_url: url });
    return "쿠팡 파트너스 API 로 제휴 링크를 생성했습니다.";
  });
}

// ───────────── 참고 게시물 ─────────────
export async function addReferencePost(fd: FormData) {
  await run(safeBack(fd, "/generate"), async () => {
    const ctx = await getCtx();
    const body = str(fd, "body");
    if (body.length < 10) throw new Error("참고 게시물은 10자 이상 입력하세요.");
    await ctx.store.insert("reference_posts", [{ user_id: ctx.userId, body, note: str(fd, "note"), is_mock: ctx.store.mode === "mock" }]);
    return "참고 게시물을 등록했습니다.";
  });
}

export async function deleteReferencePost(fd: FormData) {
  await run(safeBack(fd, "/generate"), async () => {
    const ctx = await getCtx();
    await ctx.store.remove("reference_posts", { id: str(fd, "id"), user_id: ctx.userId });
  });
}

// ───────────── AI 생성 ─────────────
export async function generateContents(fd: FormData) {
  await run("/review", async () => {
    const ctx = await getCtx();
    const product = await ctx.store.get("products", str(fd, "product_id"));
    if (!product || product.user_id !== ctx.userId) throw new Error("상품을 선택하세요.");
    if (!product.features.length) throw new Error("상품 특징을 1개 이상 등록해야 정확한 글을 만들 수 있습니다.");
    const types = fd.getAll("types").map(String).filter((t) => CONTENT_TYPES.some((c) => c.value === t)) as ContentType[];
    const [refs, existing] = await Promise.all([
      ctx.store.list("reference_posts", { eq: { user_id: ctx.userId }, order: { column: "created_at", ascending: false } }),
      ctx.store.list("contents", { eq: { product_id: product.id } }),
    ]);
    const { posts, model, mock } = await generatePosts({
      userId: ctx.userId,
      product,
      types,
      referencePosts: refs.map((r) => r.body),
      existingPosts: existing.map((c) => c.body),
      extraInstruction: str(fd, "extra") || undefined,
    });
    const now = new Date().toISOString();
    const rows = posts.map((p) => {
      const body = `${p.body.trim()}\n\n${POST_DISCLOSURE}`;
      return {
        user_id: ctx.userId,
        product_id: product.id,
        content_type: p.content_type,
        body,
        reply_text: product.affiliate_url ? buildReply(product.name.replace(/^\[모의\]\s*/, ""), product.affiliate_url) : "",
        image_url: product.image_url,
        status: "draft" as const,
        content_hash: contentHash(body),
        tracking_code: trackingCode(),
        review: {},
        generation: { model, mock, generated_at: now, angle: p.angle },
        is_mock: ctx.store.mode === "mock",
      };
    });
    const created = await ctx.store.insert("contents", rows);
    for (const c of created) await recheck(ctx, c, true);
    return `${created.length}개의 초안을 만들었습니다${mock ? " (모의 생성)" : ""}. 검토 후 승인하세요.`;
  });
}

// ───────────── 검토/승인 ─────────────
export async function updateContent(fd: FormData) {
  const id = str(fd, "id");
  await run(`/review/${id}`, async () => {
    const ctx = await getCtx();
    const c = await ownContent(ctx, id);
    if (c.status === "scheduled" || c.status === "published") throw new Error("예약/발행된 콘텐츠는 수정할 수 없습니다. 예약을 먼저 취소하세요.");
    const body = str(fd, "body");
    const reply_text = str(fd, "reply_text");
    const image_url = fd.get("use_image") === "on" ? str(fd, "image_url") || null : null;
    if (!body) throw new Error("본문이 비어 있습니다.");
    const changed = body !== c.body || reply_text !== c.reply_text || image_url !== c.image_url;
    const [u] = await ctx.store.update("contents", { id }, {
      body,
      reply_text,
      image_url,
      content_hash: contentHash(body),
      ...(changed ? { status: "draft" as const, approved_at: null } : {}),
    });
    await recheck(ctx, u, changed);
    return changed ? "저장했습니다. 내용이 바뀌어 승인 상태가 초기화되었습니다." : "저장했습니다.";
  });
}

export async function recheckContent(fd: FormData) {
  const id = str(fd, "id");
  await run(`/review/${id}`, async () => {
    const ctx = await getCtx();
    const c = await ownContent(ctx, id);
    const product = await ctx.store.get("products", c.product_id);
    const link = product?.affiliate_url ? await checkLink(product.affiliate_url) : undefined;
    await recheck(ctx, { ...c, review: { ...c.review, link } }, false);
    return "자동 검사(링크 접속 확인 포함)를 다시 실행했습니다.";
  });
}

export async function saveConfirmations(fd: FormData) {
  const id = str(fd, "id");
  await run(`/review/${id}`, async () => {
    const ctx = await getCtx();
    const c = await ownContent(ctx, id);
    const confirmed = Object.fromEntries(CHECK_KEYS.map((k) => [k, fd.get(`confirm_${k}`) === "on"]));
    await ctx.store.update("contents", { id }, { review: { ...c.review, confirmed, reviewer_note: str(fd, "reviewer_note") } });
    if (fd.get("intent") === "approve") {
      const fresh = await ownContent(ctx, id);
      const gate = canApprove(fresh.review);
      if (!gate.ok) throw new Error("승인할 수 없습니다 — " + gate.reasons.join(" / "));
      if (fresh.status !== "draft" && fresh.status !== "rejected" && fresh.status !== "failed")
        throw new Error("초안/반려/실패 상태에서만 승인할 수 있습니다.");
      await ctx.store.update("contents", { id }, { status: "approved", approved_at: new Date().toISOString() });
      return "승인했습니다. 예약 캘린더에서 발행 시간을 정하세요.";
    }
    return "확인 항목을 저장했습니다.";
  });
}

export async function setContentStatus(fd: FormData) {
  const id = str(fd, "id");
  const to = str(fd, "to");
  await run(safeBack(fd, `/review/${id}`), async () => {
    const ctx = await getCtx();
    const c = await ownContent(ctx, id);
    if (to === "rejected") {
      if (c.status === "scheduled" || c.status === "published") throw new Error("예약/발행된 콘텐츠는 반려할 수 없습니다.");
      await ctx.store.update("contents", { id }, { status: "rejected", approved_at: null });
      return "반려했습니다.";
    }
    if (to === "draft") {
      if (c.status !== "approved" && c.status !== "rejected" && c.status !== "failed") throw new Error("이 상태에서는 초안으로 되돌릴 수 없습니다.");
      await ctx.store.update("contents", { id }, { status: "draft", approved_at: null });
      return "초안으로 되돌렸습니다.";
    }
    if (to === "delete") {
      if (c.status === "scheduled" || c.status === "published") throw new Error("예약/발행된 콘텐츠는 삭제할 수 없습니다.");
      await ctx.store.remove("contents", { id, user_id: ctx.userId });
      return "삭제했습니다.";
    }
    throw new Error("알 수 없는 요청");
  });
}

// ───────────── 예약/발행 ─────────────
export async function scheduleAction(fd: FormData) {
  await run(safeBack(fd, "/calendar"), async () => {
    const ctx = await getCtx();
    const settings = await getSettings(ctx.store, ctx.userId);
    const date = str(fd, "date");
    const time = str(fd, "time");
    let when: Date | null = null;
    if (date && time) {
      when = zonedToUtc(date, time, settings.timezone);
      if (when.getTime() < Date.now() + 60_000) throw new Error("예약 시간은 현재보다 이후여야 합니다.");
    }
    const job = await scheduleContent(ctx, str(fd, "content_id"), when);
    return `예약했습니다: ${new Date(job.scheduled_at).toLocaleString("ko-KR", { timeZone: settings.timezone })}`;
  });
}

export async function cancelJobAction(fd: FormData) {
  await run(safeBack(fd, "/calendar"), async () => {
    await cancelJob(await getCtx(), str(fd, "job_id"));
    return "예약을 취소했습니다. 콘텐츠는 '승인' 상태로 돌아갑니다.";
  });
}

export async function rescheduleAction(fd: FormData) {
  await run(safeBack(fd, "/calendar"), async () => {
    const ctx = await getCtx();
    const settings = await getSettings(ctx.store, ctx.userId);
    const when = zonedToUtc(str(fd, "date"), str(fd, "time"), settings.timezone);
    if (when.getTime() < Date.now() + 60_000) throw new Error("예약 시간은 현재보다 이후여야 합니다.");
    await rescheduleJob(ctx, str(fd, "job_id"), when);
    return "예약 시간을 변경했습니다.";
  });
}

export async function retryJobAction(fd: FormData) {
  await run(safeBack(fd, "/history"), async () => {
    const ctx = await getCtx();
    await retryJob(ctx, str(fd, "job_id"));
    const r = await processDueJobs({ userId: ctx.userId, jobId: str(fd, "job_id"), ignorePause: true });
    return `재시도 결과: 발행 ${r.published} · 재시도 대기 ${r.retried} · 실패 ${r.failed}`;
  });
}

/** 테스트 발행: 승인된 콘텐츠를 지금 즉시 발행 (일시 정지 무시, 하루 한도는 적용) */
export async function publishNowAction(fd: FormData) {
  await run(safeBack(fd, "/history"), async () => {
    const ctx = await getCtx();
    const job = await scheduleContent(ctx, str(fd, "content_id"), new Date());
    const r = await processDueJobs({ userId: ctx.userId, jobId: job.id, ignorePause: true });
    if (r.published) return appMode() === "mock" ? "모의 발행 완료 (실제 Threads 에는 게시되지 않음)" : "Threads 에 발행했습니다.";
    const after = await ctx.store.get("publish_jobs", job.id);
    throw new Error(`발행 실패: ${after?.last_error ?? "알 수 없음"}`);
  });
}

export async function runDueNowAction(fd: FormData) {
  await run(safeBack(fd, "/calendar"), async () => {
    const ctx = await getCtx();
    const r = await processDueJobs({ userId: ctx.userId });
    return `예약 처리 실행: 확인 ${r.checked} · 발행 ${r.published} · 재시도 대기 ${r.retried} · 실패 ${r.failed}${r.skipped.length ? ` · 건너뜀 ${r.skipped.length} (${r.skipped[0]})` : ""}`;
  });
}

// ───────────── 설정 ─────────────
export async function saveSettings(fd: FormData) {
  await run("/settings", async () => {
    const ctx = await getCtx();
    const times = normalizeTimes(str(fd, "posting_times").split(/[,\s]+/));
    const limit = Math.min(MAX_DAILY_LIMIT, Math.max(1, Number(str(fd, "daily_limit")) || MAX_DAILY_LIMIT));
    if (!times.length) throw new Error("게시 시간을 HH:MM 형식으로 1개 이상 입력하세요.");
    const tz = str(fd, "timezone") || "Asia/Seoul";
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
    } catch {
      throw new Error("올바른 시간대가 아닙니다 (예: Asia/Seoul).");
    }
    const cur = await getSettings(ctx.store, ctx.userId);
    await ctx.store.upsert("settings", {
      ...cur,
      user_id: ctx.userId,
      timezone: tz,
      daily_limit: limit,
      posting_times: times.slice(0, 6),
      post_affiliate_reply: fd.get("post_affiliate_reply") === "on",
      updated_at: new Date().toISOString(),
    }, "user_id");
    return "설정을 저장했습니다.";
  });
}

export async function togglePause(fd: FormData) {
  await run(safeBack(fd, "/calendar"), async () => {
    const ctx = await getCtx();
    const cur = await getSettings(ctx.store, ctx.userId);
    const paused = !cur.autopublish_paused;
    await ctx.store.upsert("settings", { ...cur, user_id: ctx.userId, autopublish_paused: paused, updated_at: new Date().toISOString() }, "user_id");
    return paused ? "자동 발행을 일시 정지했습니다." : "자동 발행을 재개했습니다.";
  });
}

export async function disconnectThreads() {
  await run("/settings", async () => {
    const ctx = await getCtx();
    await disconnectAccount(ctx.userId);
    return "Threads 계정 연결을 해제했습니다. (Threads 앱 설정에서도 앱 권한을 제거할 수 있습니다)";
  });
}

export async function markNotificationsRead() {
  await run("/", async () => {
    const ctx = await getCtx();
    await ctx.store.update("notifications", { user_id: ctx.userId, read: false }, { read: true });
  });
}

// ───────────── 성과 ─────────────
export async function importMetricsCsv(fd: FormData) {
  await run("/analytics", async () => {
    const ctx = await getCtx();
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("CSV 파일을 선택하세요.");
    if (file.size > 2_000_000) throw new Error("파일이 너무 큽니다 (최대 2MB).");
    const { rows, errors } = parseMetricsCsv(await file.text());
    if (!rows.length) throw new Error(errors.join(" / ") || "가져올 행이 없습니다.");
    const [contents, products] = await Promise.all([
      ctx.store.list("contents", { eq: { user_id: ctx.userId } }),
      ctx.store.list("products", { eq: { user_id: ctx.userId } }),
    ]);
    const batch = `csv-${new Date().toISOString()}`;
    let linked = 0;
    const toInsert = rows.map((r) => {
      const content = r.sub_id ? contents.find((c) => c.tracking_code === r.sub_id) : undefined;
      const product = content
        ? products.find((p) => p.id === content.product_id)
        : r.product
          ? products.find((p) => p.name.replace(/^\[모의\]\s*/, "") === r.product || p.name === r.product)
          : undefined;
      if (content || product) linked++;
      return {
        user_id: ctx.userId,
        metric_date: r.date,
        content_id: content?.id ?? null,
        product_id: product?.id ?? null,
        sub_id: r.sub_id,
        clicks: r.clicks,
        orders: r.orders,
        commission: r.commission,
        source: "csv" as const,
        import_batch: batch,
      };
    });
    await ctx.store.insert("affiliate_metrics", toInsert);
    return `${rows.length}행을 가져왔습니다 (게시물/상품 연결 ${linked}행).${errors.length ? " 참고: " + errors.slice(0, 3).join(" / ") : ""}`;
  });
}

export async function deleteImportBatch(fd: FormData) {
  await run("/analytics", async () => {
    const ctx = await getCtx();
    await ctx.store.remove("affiliate_metrics", { user_id: ctx.userId, import_batch: str(fd, "batch") });
    return "가져온 데이터를 삭제했습니다.";
  });
}

export async function refreshInsightsAction() {
  await run("/analytics", async () => {
    const ctx = await getCtx();
    const r = await refreshInsights({ userId: ctx.userId });
    return `인사이트 갱신: 게시물 ${r.jobs}개 중 ${r.updated}개 업데이트${appMode() === "mock" ? " (모의 수치)" : ""}`;
  });
}
