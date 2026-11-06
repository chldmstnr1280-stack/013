import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { env } from "../env";

/** 로그인 사용자 세션(쿠키) 기반 클라이언트 — RLS 적용 */
export async function supabaseUserClient() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Server Component 에서 호출된 경우 쿠키 설정 불가 — proxy 가 세션을 갱신함
        }
      },
    },
  });
}

/** service role 클라이언트 — 서버 전용(cron, 토큰 저장). 절대 클라이언트로 노출 금지 */
export function supabaseAdminClient() {
  const key = env.supabaseServiceKey();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다.");
  return createClient(env.supabaseUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}
