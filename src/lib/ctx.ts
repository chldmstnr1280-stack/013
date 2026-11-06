import "server-only";
import path from "node:path";
import { redirect } from "next/navigation";
import { appMode } from "./env";
import { MockStore } from "./store/mock-store";
import { MOCK_USER_EMAIL, MOCK_USER_ID, mockSeed } from "./store/seed";
import { SupabaseStore } from "./store/supabase-store";
import type { Ctx, Store } from "./store/types";
import { supabaseAdminClient, supabaseUserClient } from "./supabase/server";

export function mockDbPath() {
  if (process.env.MOCK_DB_PATH) return process.env.MOCK_DB_PATH;
  // Vercel 등 읽기 전용 파일 시스템에서는 /tmp 사용 (인스턴스마다 초기화됨)
  return process.env.VERCEL ? "/tmp/mock-db.json" : path.join(process.cwd(), ".data", "mock-db.json");
}

const g = globalThis as unknown as { __mockStore?: MockStore };
function mockStore() {
  g.__mockStore ??= new MockStore(mockDbPath(), mockSeed);
  return g.__mockStore;
}

/** 현재 요청의 사용자 컨텍스트. live 모드에서 로그인하지 않았으면 /login 으로 이동 */
export async function getCtx(): Promise<Ctx> {
  if (appMode() === "mock") return { store: mockStore(), userId: MOCK_USER_ID, email: MOCK_USER_EMAIL };
  const sb = await supabaseUserClient();
  const { data } = await sb.auth.getUser();
  if (!data.user) redirect("/login");
  return { store: new SupabaseStore(sb), userId: data.user.id, email: data.user.email ?? null };
}

/** 사용자 세션과 무관한 서버 전용 저장소 (cron, 토큰 테이블). live 에서는 service role */
export function systemStore(): Store {
  if (appMode() === "mock") return mockStore();
  return new SupabaseStore(supabaseAdminClient());
}
