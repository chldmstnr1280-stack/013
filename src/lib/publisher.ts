import "server-only";
import { appMode } from "./env";
import { systemStore } from "./ctx";
import { logApi, notify } from "./log";
import { backoffMs, countOnDay, effectiveLimit, localDate, nextFreeSlot } from "./schedule";
import { getSettings } from "./settings";
import { UniqueViolation, type Ctx, type Store } from "./store/types";
import { getAccountWithToken } from "./threads-account";
import { getMediaInsights, mockThreads, publish, ThreadsApiError } from "./threads";
import type { Content, PublishJob } from "./types";

const STUCK_MS = 15 * 60_000;

/** 이미 같은 본문(해시)이 발행되었는지 */
async function alreadyPublished(store: Store, userId: string, hash: string, exceptJobId?: string) {
  const jobs = await store.list("publish_jobs", { eq: { user_id: userId, content_hash: hash, status: "published" } });
  return jobs.some((j) => j.id !== exceptJobId);
}

/** 승인된 콘텐츠를 예약. when 이 없으면 다음 빈 슬롯에 자동 배정 */
export async function scheduleContent(ctx: Ctx, contentId: string, when: Date | null) {
  const { store, userId } = ctx;
  const content = await store.get("contents", contentId);
  if (!content || content.user_id !== userId) throw new Error("콘텐츠를 찾을 수 없습니다.");
  if (content.status !== "approved") throw new Error("승인된 콘텐츠만 예약할 수 있습니다.");
  if (await alreadyPublished(store, userId, content.content_hash)) throw new Error("같은 내용이 이미 발행되었습니다 (중복 발행 방지).");

  const settings = await getSettings(store, userId);
  const jobs = await store.list("publish_jobs", { eq: { user_id: userId } });
  const at = when ?? nextFreeSlot(jobs, settings);
  if (!at) throw new Error("앞으로 60일 안에 빈 게시 슬롯이 없습니다. 게시 시간 설정을 확인하세요.");
  const day = localDate(at, settings.timezone);
  if (countOnDay(jobs, day, settings.timezone) >= effectiveLimit(settings))
    throw new Error(`${day} 은 하루 최대 게시물 수(${effectiveLimit(settings)}개)에 도달했습니다.`);

  // 이전에 최종 실패한 작업은 취소 처리 → 새 작업 생성 허용 (콘텐츠당 활성 작업 1개 제약)
  await store.update("publish_jobs", { content_id: content.id, status: "failed" }, { status: "cancelled" });
  try {
    const [job] = await store.insert("publish_jobs", [
      {
        user_id: userId,
        content_id: content.id,
        content_hash: content.content_hash,
        scheduled_at: at.toISOString(),
        status: "pending",
        attempts: 0,
        max_attempts: 3,
        is_mock: store.mode === "mock",
      },
    ]);
    await store.update("contents", { id: content.id }, { status: "scheduled" });
    return job;
  } catch (e) {
    if (e instanceof UniqueViolation) throw new Error("이 콘텐츠는 이미 예약되어 있습니다.");
    throw e;
  }
}

export async function cancelJob(ctx: Ctx, jobId: string) {
  const [job] = await ctx.store.update("publish_jobs", { id: jobId, user_id: ctx.userId, status: "pending" }, { status: "cancelled" });
  if (!job) throw new Error("대기 중인 예약만 취소할 수 있습니다.");
  await ctx.store.update("contents", { id: job.content_id, status: "scheduled" }, { status: "approved" });
}

export async function rescheduleJob(ctx: Ctx, jobId: string, when: Date) {
  const job = await ctx.store.get("publish_jobs", jobId);
  if (!job || job.user_id !== ctx.userId || job.status !== "pending") throw new Error("대기 중인 예약만 변경할 수 있습니다.");
  const settings = await getSettings(ctx.store, ctx.userId);
  const jobs = (await ctx.store.list("publish_jobs", { eq: { user_id: ctx.userId } })).filter((j) => j.id !== jobId);
  const day = localDate(when, settings.timezone);
  if (countOnDay(jobs, day, settings.timezone) >= effectiveLimit(settings))
    throw new Error(`${day} 은 하루 최대 게시물 수에 도달했습니다.`);
  await ctx.store.update("publish_jobs", { id: jobId, status: "pending" }, { scheduled_at: when.toISOString(), next_attempt_at: null });
}

/** 실패한 작업을 수동으로 다시 대기열에 넣음 */
export async function retryJob(ctx: Ctx, jobId: string) {
  const job = await ctx.store.get("publish_jobs", jobId);
  if (!job || job.user_id !== ctx.userId || job.status !== "failed") throw new Error("실패한 작업만 재시도할 수 있습니다.");
  if (await alreadyPublished(ctx.store, ctx.userId, job.content_hash, job.id)) throw new Error("같은 내용이 이미 발행되었습니다.");
  await ctx.store.update("publish_jobs", { id: jobId, status: "failed" }, {
    status: "pending",
    attempts: 0,
    next_attempt_at: null,
    last_error: null,
    scheduled_at: new Date().toISOString(),
  });
  await ctx.store.update("contents", { id: job.content_id }, { status: "scheduled" });
}

export interface RunReport {
  checked: number;
  published: number;
  failed: number;
  retried: number;
  skipped: string[];
}

/**
 * 예약 시간이 된 작업을 발행한다. Cron(/api/cron/publish) 과 '지금 실행' 버튼이 호출.
 * 중복 발행 방지:
 *  1) pending → processing 조건부 갱신(선점)에 성공한 실행만 발행
 *  2) 같은 해시가 이미 published 면 취소
 *  3) DB 고유 인덱스(content_hash, status=published)
 *  4) processing 상태로 오래 멈춘 작업은 자동 재시도하지 않고 사람 확인을 요구
 */
export async function processDueJobs(opts: { userId?: string; jobId?: string; ignorePause?: boolean } = {}): Promise<RunReport> {
  const store = systemStore();
  const now = new Date();
  const report: RunReport = { checked: 0, published: 0, failed: 0, retried: 0, skipped: [] };

  // 멈춘 작업 정리
  const stuck = await store.list("publish_jobs", { eq: { status: "processing", ...(opts.userId ? { user_id: opts.userId } : {}) } });
  for (const j of stuck) {
    if (now.getTime() - new Date(j.updated_at).getTime() < STUCK_MS) continue;
    await store.update("publish_jobs", { id: j.id, status: "processing" }, {
      status: "failed",
      last_error: "처리 중 중단되었습니다. Threads 에 실제로 게시되었는지 확인 후 수동 재시도하세요 (중복 방지를 위해 자동 재시도 안 함).",
    });
    await store.update("contents", { id: j.content_id }, { status: "failed" });
    await notify(j.user_id, "error", "발행 작업이 처리 중 중단되었습니다. 발행 기록을 확인하세요.");
  }

  const due = (
    await store.list("publish_jobs", {
      eq: { status: "pending", ...(opts.userId ? { user_id: opts.userId } : {}), ...(opts.jobId ? { id: opts.jobId } : {}) },
      lte: { scheduled_at: now.toISOString() },
      order: { column: "scheduled_at", ascending: true },
      limit: 20,
    })
  ).filter((j) => !j.next_attempt_at || new Date(j.next_attempt_at) <= now);

  const settingsCache = new Map<string, Awaited<ReturnType<typeof getSettings>>>();
  for (const job of due) {
    report.checked++;
    if (!settingsCache.has(job.user_id)) settingsCache.set(job.user_id, await getSettings(store, job.user_id));
    const settings = settingsCache.get(job.user_id)!;
    if (settings.autopublish_paused && !opts.ignorePause) {
      report.skipped.push(`${job.id}: 자동 발행 일시 정지 중`);
      continue;
    }
    // 선점: 같은 attempts 값일 때만 processing 으로 → 동시 실행 중 하나만 성공
    const [claimed] = await store.update(
      "publish_jobs",
      { id: job.id, status: "pending", attempts: job.attempts },
      { status: "processing", attempts: job.attempts + 1 },
    );
    if (!claimed) {
      report.skipped.push(`${job.id}: 다른 실행이 처리 중`);
      continue;
    }
    const outcome = await runJob(store, claimed);
    if (outcome === "published") report.published++;
    else if (outcome === "retry") report.retried++;
    else report.failed++;
  }
  if (report.checked) await logApi(opts.userId ?? null, "system", "process_due_jobs", true, JSON.stringify(report));
  return report;
}

async function failJob(store: Store, job: PublishJob, message: string, retryable: boolean): Promise<"retry" | "failed"> {
  if (retryable && job.attempts < job.max_attempts) {
    const next = new Date(Date.now() + backoffMs(job.attempts));
    await store.update("publish_jobs", { id: job.id, status: "processing" }, {
      status: "pending",
      last_error: message,
      next_attempt_at: next.toISOString(),
    });
    return "retry";
  }
  await store.update("publish_jobs", { id: job.id, status: "processing" }, { status: "failed", last_error: message, next_attempt_at: null });
  await store.update("contents", { id: job.content_id }, { status: "failed" });
  await notify(job.user_id, "error", `게시 실패: ${message}`);
  return "failed";
}

async function runJob(store: Store, job: PublishJob): Promise<"published" | "retry" | "failed"> {
  const content = (await store.get("contents", job.content_id)) as Content | null;
  if (!content) return failJob(store, job, "콘텐츠가 삭제되었습니다.", false);
  if (content.status !== "scheduled" || !content.approved_at) return failJob(store, job, "승인 상태가 아닌 콘텐츠는 발행하지 않습니다.", false);
  if (content.content_hash !== job.content_hash) return failJob(store, job, "예약 후 본문이 변경되었습니다. 다시 승인하세요.", false);
  if (await alreadyPublished(store, job.user_id, job.content_hash, job.id)) {
    await store.update("publish_jobs", { id: job.id }, { status: "cancelled", last_error: "같은 내용이 이미 발행되어 취소됨" });
    return "failed";
  }

  const settings = await getSettings(store, job.user_id);
  const todays = await store.list("publish_jobs", { eq: { user_id: job.user_id, status: "published" } });
  const today = localDate(new Date(), settings.timezone);
  const publishedToday = todays.filter((j) => j.published_at && localDate(j.published_at, settings.timezone) === today).length;
  if (publishedToday >= effectiveLimit(settings)) return failJob(store, job, `오늘 발행 한도(${effectiveLimit(settings)}개)를 초과하여 보류했습니다.`, false);

  const isMock = appMode() === "mock";
  let mediaId: string;
  let permalink: string | null = null;
  let token: string | null = null;
  let threadsUserId = "";
  try {
    if (isMock) {
      ({ mediaId, permalink } = await mockThreads.publish({ text: content.body, imageUrl: content.image_url }));
    } else {
      const account = await getAccountWithToken(job.user_id);
      if (!account) return failJob(store, job, "Threads 계정이 연결되어 있지 않습니다.", false);
      token = account.token;
      threadsUserId = account.threadsUserId;
      ({ mediaId, permalink } = await publish(token, threadsUserId, { text: content.body, imageUrl: content.image_url }));
    }
    await logApi(job.user_id, "threads", isMock ? "publish(mock)" : "publish", true, mediaId);
  } catch (e) {
    const err = e as Error;
    const retryable = e instanceof ThreadsApiError ? e.retryable : false;
    await logApi(job.user_id, "threads", isMock ? "publish(mock)" : "publish", false, err.message, e instanceof ThreadsApiError ? e.status : null);
    return failJob(store, job, err.message, retryable);
  }

  try {
    await store.update("publish_jobs", { id: job.id }, {
      status: "published",
      threads_media_id: mediaId,
      permalink,
      published_at: new Date().toISOString(),
      last_error: null,
      next_attempt_at: null,
    });
  } catch (e) {
    // 고유 인덱스 충돌: 동시에 같은 본문이 발행됨 → 기록만 남김
    await notify(job.user_id, "error", `중복 발행 감지: 미디어 ${mediaId} 를 Threads 에서 확인하세요. (${(e as Error).message})`);
    return "failed";
  }
  await store.update("contents", { id: content.id }, { status: "published" });

  // 제휴 링크 답글 (본 게시물 발행 후). 실패해도 본 게시물은 재발행하지 않는다.
  if (settings.post_affiliate_reply && content.reply_text.trim()) {
    try {
      const r = isMock
        ? await mockThreads.publish({ text: content.reply_text })
        : await publish(token!, threadsUserId, { text: content.reply_text, replyToId: mediaId });
      await store.update("publish_jobs", { id: job.id }, { threads_reply_id: r.mediaId, reply_error: null });
      await logApi(job.user_id, "threads", isMock ? "reply(mock)" : "reply", true, r.mediaId);
    } catch (e) {
      const msg = (e as Error).message;
      await store.update("publish_jobs", { id: job.id }, { reply_error: msg });
      await logApi(job.user_id, "threads", isMock ? "reply(mock)" : "reply", false, msg);
      await notify(job.user_id, "warning", `본문은 게시되었지만 제휴 링크 답글 작성에 실패했습니다: ${msg}`);
    }
  }
  return "published";
}

/** 발행 게시물 인사이트 갱신 (최근 30일). 모의 모드에서는 source='mock' 으로 임의 수치를 기록 */
export async function refreshInsights(opts: { userId?: string } = {}) {
  const store = systemStore();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const jobs = await store.list("publish_jobs", {
    eq: { status: "published", ...(opts.userId ? { user_id: opts.userId } : {}) },
    gte: { published_at: since },
  });
  let updated = 0;
  const tokens = new Map<string, string | null>();
  for (const j of jobs) {
    if (!j.threads_media_id) continue;
    try {
      let m: Partial<Record<"views" | "likes" | "replies" | "reposts" | "quotes", number>>;
      let source: "mock" | "threads_api";
      if (j.is_mock || appMode() === "mock") {
        const prev = (await store.list("post_insights", { eq: { job_id: j.id } }))[0];
        const grow = (n: number | null | undefined, base: number) => (n ?? 0) + Math.floor(Math.random() * base);
        m = { views: grow(prev?.views, 200), likes: grow(prev?.likes, 8), replies: grow(prev?.replies, 2), reposts: grow(prev?.reposts, 1), quotes: grow(prev?.quotes, 1) };
        source = "mock";
      } else {
        if (!tokens.has(j.user_id)) tokens.set(j.user_id, (await getAccountWithToken(j.user_id))?.token ?? null);
        const token = tokens.get(j.user_id);
        if (!token) continue;
        m = await getMediaInsights(token, j.threads_media_id);
        source = "threads_api";
      }
      await store.upsert(
        "post_insights",
        {
          user_id: j.user_id,
          job_id: j.id,
          content_id: j.content_id,
          views: m.views ?? null,
          likes: m.likes ?? null,
          replies: m.replies ?? null,
          reposts: m.reposts ?? null,
          quotes: m.quotes ?? null,
          source,
          fetched_at: new Date().toISOString(),
        },
        "job_id",
      );
      updated++;
    } catch (e) {
      await logApi(j.user_id, "threads", "insights", false, (e as Error).message, e instanceof ThreadsApiError ? e.status : null);
    }
  }
  return { jobs: jobs.length, updated };
}
