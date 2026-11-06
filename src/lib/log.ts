import "server-only";
import { env } from "./env";
import { systemStore } from "./ctx";

/** API 호출 결과 기록 (api_logs). 기록 실패가 본 작업을 막지 않도록 예외를 삼킨다. */
export async function logApi(
  userId: string | null,
  provider: "threads" | "claude" | "coupang" | "system",
  action: string,
  ok: boolean,
  message?: string | null,
  statusCode?: number | null,
) {
  try {
    await systemStore().insert("api_logs", [
      { user_id: userId, provider, action, ok, message: message?.slice(0, 2000) ?? null, status_code: statusCode ?? null },
    ]);
  } catch (e) {
    console.error("[api_logs] 기록 실패", e);
  }
  if (!ok) console.warn(`[${provider}] ${action} 실패: ${message ?? ""}`);
}

/** 앱 내 알림 + (설정 시) 외부 webhook 알림 */
export async function notify(userId: string, level: "info" | "warning" | "error", message: string) {
  try {
    await systemStore().insert("notifications", [{ user_id: userId, level, message, read: false }]);
  } catch (e) {
    console.error("[notifications] 기록 실패", e);
  }
  const hook = env.notifyWebhook();
  if (hook && level !== "info") {
    try {
      await fetch(hook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Slack(text) / Discord(content) 양쪽 호환
        body: JSON.stringify({ text: `[AI Commerce Autopilot] ${message}`, content: `[AI Commerce Autopilot] ${message}` }),
      });
    } catch (e) {
      console.error("[notify webhook] 실패", e);
    }
  }
}
