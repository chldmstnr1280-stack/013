import { NextResponse } from "next/server";
import { getCtx, systemStore } from "@/lib/ctx";
import { appMode, integrationStatus } from "@/lib/env";
import { authorizeUrl, newOAuthState } from "@/lib/threads";

export const dynamic = "force-dynamic";

const back = (req: Request, err: string) =>
  NextResponse.redirect(new URL(`/settings?err=${encodeURIComponent(err)}`, req.url));

export async function GET(req: Request) {
  if (appMode() === "mock") return back(req, "모의 모드에서는 Threads 계정을 연결하지 않습니다. APP_MODE=live 로 실행하세요.");
  const st = integrationStatus();
  if (!st.threadsApp) return back(req, "THREADS_APP_ID / THREADS_APP_SECRET 이 설정되지 않았습니다.");
  if (!st.tokenEncryption) return back(req, "TOKEN_ENCRYPTION_KEY 가 설정되지 않았습니다.");
  if (!st.supabaseServiceRole) return back(req, "SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (토큰 저장).");
  const ctx = await getCtx();
  const state = newOAuthState();
  await systemStore().insert("oauth_states", [{ state, user_id: ctx.userId }]);
  return NextResponse.redirect(authorizeUrl(state));
}
