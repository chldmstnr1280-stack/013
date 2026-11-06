import "server-only";

/**
 * 실행 모드
 * - mock: 로컬 JSON 파일 저장소(.data/mock-db.json) + 모의 Claude/Threads. 외부 호출 없음.
 * - live: Supabase + 실제 API. 키가 없는 기능은 '미설정'으로 안내하고 동작하지 않음.
 */
export type AppMode = "mock" | "live";

export function appMode(): AppMode {
  const raw = process.env.APP_MODE?.trim().toLowerCase();
  if (raw === "live") return "live";
  if (raw === "mock") return "mock";
  return process.env.NEXT_PUBLIC_SUPABASE_URL ? "live" : "mock";
}

export const env = {
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  supabaseUrl: () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceKey: () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  anthropicKey: () => process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
  threadsAppId: () => process.env.THREADS_APP_ID ?? "",
  threadsAppSecret: () => process.env.THREADS_APP_SECRET ?? "",
  threadsRedirectUri: () =>
    process.env.THREADS_REDIRECT_URI ?? `${env.appUrl()}/api/threads/callback`,
  tokenKey: () => process.env.TOKEN_ENCRYPTION_KEY ?? "",
  cronSecret: () => process.env.CRON_SECRET ?? "",
  coupangAccessKey: () => process.env.COUPANG_ACCESS_KEY ?? "",
  coupangSecretKey: () => process.env.COUPANG_SECRET_KEY ?? "",
  notifyWebhook: () => process.env.NOTIFY_WEBHOOK_URL ?? "",
};

/** 화면에 보여줄 연동 상태 (값 자체는 절대 노출하지 않음) */
export function integrationStatus() {
  const mode = appMode();
  return {
    mode,
    supabase: Boolean(env.supabaseUrl() && env.supabaseAnonKey()),
    supabaseServiceRole: Boolean(env.supabaseServiceKey()),
    claude: Boolean(env.anthropicKey()),
    claudeModel: env.anthropicModel(),
    threadsApp: Boolean(env.threadsAppId() && env.threadsAppSecret()),
    tokenEncryption: /^[0-9a-fA-F]{64}$/.test(env.tokenKey()),
    cron: Boolean(env.cronSecret()),
    coupang: Boolean(env.coupangAccessKey() && env.coupangSecretKey()),
    notifyWebhook: Boolean(env.notifyWebhook()),
  };
}
