import { NextResponse } from "next/server";
import { getCtx, systemStore } from "@/lib/ctx";
import { logApi } from "@/lib/log";
import { exchangeCode, getProfile } from "@/lib/threads";
import { saveAccount } from "@/lib/threads-account";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const to = (q: string) => NextResponse.redirect(new URL(`/settings?${q}`, req.url));
  const ctx = await getCtx();
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  const denied = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const store = systemStore();
  const saved = state ? await store.get("oauth_states", state) : null;
  if (state) await store.remove("oauth_states", { state });
  if (!saved || saved.user_id !== ctx.userId || Date.now() - new Date(saved.created_at).getTime() > 15 * 60_000)
    return to(`err=${encodeURIComponent("OAuth state 검증 실패. 다시 시도하세요.")}`);
  if (denied || !code) return to(`err=${encodeURIComponent("Threads 연결이 취소되었습니다: " + (denied ?? "code 없음"))}`);
  try {
    const tok = await exchangeCode(code);
    const me = await getProfile(tok.accessToken).catch(() => ({ id: tok.userId, username: undefined }));
    await saveAccount(ctx.userId, me.id || tok.userId, me.username ?? null, tok.accessToken, tok.expiresIn);
    await logApi(ctx.userId, "threads", "oauth_connect", true, me.username ?? me.id);
    return to(`msg=${encodeURIComponent(`Threads 계정 @${me.username ?? me.id} 을 연결했습니다.`)}`);
  } catch (e) {
    await logApi(ctx.userId, "threads", "oauth_connect", false, (e as Error).message);
    return to(`err=${encodeURIComponent("Threads 연결 실패: " + (e as Error).message)}`);
  }
}
