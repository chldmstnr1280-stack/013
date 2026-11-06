import "server-only";
import crypto from "node:crypto";
import { env } from "./env";

/**
 * Meta Threads 공식 Graph API 클라이언트
 * 문서: https://developers.facebook.com/docs/threads
 *
 * 필요한 권한(scope)
 *  - threads_basic            : 프로필 조회
 *  - threads_content_publish  : 게시물 발행
 *  - threads_manage_replies   : 내 게시물에 답글 작성 (제휴 링크 답글)
 *  - threads_manage_insights  : 조회수/반응 인사이트
 *
 * 발행은 2단계: (1) 미디어 컨테이너 생성 → (2) threads_publish.
 * 공식 제한: 24시간 250개 게시물 / 1,000개 답글, 본문 500자.
 */

const GRAPH = "https://graph.threads.net";
const VERSION = "v1.0";
export const THREADS_SCOPES = [
  "threads_basic",
  "threads_content_publish",
  "threads_manage_replies",
  "threads_manage_insights",
];

export class ThreadsApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryable: boolean,
  ) {
    super(message);
  }
}

async function call<T>(method: "GET" | "POST", url: string, params: Record<string, string>): Promise<T> {
  const u = new URL(url);
  const init: RequestInit = { method, cache: "no-store" };
  if (method === "GET") for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  else init.body = new URLSearchParams(params);
  let res: Response;
  try {
    res = await fetch(u, init);
  } catch (e) {
    throw new ThreadsApiError(`네트워크 오류: ${(e as Error).message}`, 0, true);
  }
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T;
  if (!res.ok || json.error) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    // 5xx, 429, 일시적 오류 코드(1,2,4,17,32,613)는 재시도 가능
    const transient = [1, 2, 4, 17, 32, 613].includes(json.error?.code ?? -1);
    throw new ThreadsApiError(msg, res.status, res.status >= 500 || res.status === 429 || transient);
  }
  return json;
}

// ───────────── OAuth ─────────────
export function authorizeUrl(state: string) {
  const u = new URL("https://threads.net/oauth/authorize");
  u.searchParams.set("client_id", env.threadsAppId());
  u.searchParams.set("redirect_uri", env.threadsRedirectUri());
  u.searchParams.set("scope", THREADS_SCOPES.join(","));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  return u.toString();
}

export const newOAuthState = () => crypto.randomBytes(24).toString("base64url");

/** code → 단기 토큰(1시간) → 장기 토큰(60일) */
export async function exchangeCode(code: string) {
  const short = await call<{ access_token: string; user_id: string | number }>("POST", `${GRAPH}/oauth/access_token`, {
    client_id: env.threadsAppId(),
    client_secret: env.threadsAppSecret(),
    grant_type: "authorization_code",
    redirect_uri: env.threadsRedirectUri(),
    code,
  });
  const long = await call<{ access_token: string; expires_in: number }>("GET", `${GRAPH}/access_token`, {
    grant_type: "th_exchange_token",
    client_secret: env.threadsAppSecret(),
    access_token: short.access_token,
  });
  return { accessToken: long.access_token, expiresIn: long.expires_in, userId: String(short.user_id) };
}

/** 장기 토큰 갱신 (발급 24시간 이후 ~ 만료 전) */
export async function refreshToken(token: string) {
  return call<{ access_token: string; expires_in: number }>("GET", `${GRAPH}/refresh_access_token`, {
    grant_type: "th_refresh_token",
    access_token: token,
  });
}

export async function getProfile(token: string) {
  return call<{ id: string; username?: string }>("GET", `${GRAPH}/${VERSION}/me`, {
    fields: "id,username",
    access_token: token,
  });
}

export async function getPublishingLimit(token: string, threadsUserId: string) {
  const r = await call<{ data: { quota_usage?: number; reply_quota_usage?: number; config?: { quota_total?: number } }[] }>(
    "GET",
    `${GRAPH}/${VERSION}/${threadsUserId}/threads_publishing_limit`,
    { fields: "quota_usage,config,reply_quota_usage,reply_config", access_token: token },
  );
  return r.data?.[0] ?? null;
}

// ───────────── 발행 ─────────────
export interface PostInput {
  text: string;
  imageUrl?: string | null;
  replyToId?: string;
}

async function createContainer(token: string, uid: string, p: PostInput) {
  const params: Record<string, string> = {
    media_type: p.imageUrl ? "IMAGE" : "TEXT",
    text: p.text,
    access_token: token,
  };
  if (p.imageUrl) params.image_url = p.imageUrl;
  if (p.replyToId) params.reply_to_id = p.replyToId;
  const r = await call<{ id: string }>("POST", `${GRAPH}/${VERSION}/${uid}/threads`, params);
  return r.id;
}

async function waitContainerReady(token: string, containerId: string) {
  // 이미지 컨테이너는 처리 시간이 필요. 공식 권장: 게시 전 상태 확인 (최대 ~30초 대기)
  for (let i = 0; i < 10; i++) {
    const s = await call<{ status?: string; error_message?: string }>("GET", `${GRAPH}/${VERSION}/${containerId}`, {
      fields: "status,error_message",
      access_token: token,
    });
    if (s.status === "FINISHED" || s.status === "PUBLISHED") return;
    if (s.status === "ERROR" || s.status === "EXPIRED")
      throw new ThreadsApiError(`컨테이너 처리 실패: ${s.error_message ?? s.status}`, 400, false);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new ThreadsApiError("컨테이너 처리 대기 시간 초과", 504, true);
}

export async function publish(token: string, uid: string, p: PostInput) {
  const containerId = await createContainer(token, uid, p);
  await waitContainerReady(token, containerId);
  const r = await call<{ id: string }>("POST", `${GRAPH}/${VERSION}/${uid}/threads_publish`, {
    creation_id: containerId,
    access_token: token,
  });
  let permalink: string | null = null;
  try {
    const m = await call<{ permalink?: string }>("GET", `${GRAPH}/${VERSION}/${r.id}`, {
      fields: "permalink",
      access_token: token,
    });
    permalink = m.permalink ?? null;
  } catch {
    // permalink 조회 실패는 발행 성공에 영향 없음
  }
  return { mediaId: r.id, permalink };
}

// ───────────── 인사이트 ─────────────
export const INSIGHT_METRICS = ["views", "likes", "replies", "reposts", "quotes"] as const;
export type InsightMetric = (typeof INSIGHT_METRICS)[number];

export async function getMediaInsights(token: string, mediaId: string) {
  const r = await call<{ data: { name: InsightMetric; values?: { value: number }[]; total_value?: { value: number } }[] }>(
    "GET",
    `${GRAPH}/${VERSION}/${mediaId}/insights`,
    { metric: INSIGHT_METRICS.join(","), access_token: token },
  );
  const out: Partial<Record<InsightMetric, number>> = {};
  for (const d of r.data ?? []) out[d.name] = d.total_value?.value ?? d.values?.[0]?.value;
  return out;
}

// ───────────── 모의 클라이언트 (APP_MODE=mock) ─────────────
/** 외부 호출 없이 성공/실패를 흉내낸다. 본문에 "[실패테스트]" 가 있으면 일시적 오류를 발생시켜 재시도 흐름을 시험할 수 있다. */
export const mockThreads = {
  async publish(p: PostInput) {
    if (p.text.includes("[실패테스트]")) throw new ThreadsApiError("모의 일시 오류 (테스트용)", 503, true);
    const id = `mock_${crypto.randomBytes(5).toString("hex")}`;
    return { mediaId: id, permalink: null as string | null };
  },
};
