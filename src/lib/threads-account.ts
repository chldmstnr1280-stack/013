import "server-only";
import { appMode } from "./env";
import { systemStore } from "./ctx";
import { decryptSecret, encryptSecret } from "./crypto";
import { logApi } from "./log";
import { refreshToken } from "./threads";

export interface ConnectedAccount {
  threadsUserId: string;
  username: string | null;
  expiresAt: string | null;
  token: string;
}

/** 공개 가능한 연결 정보만 반환 (토큰 제외) */
export async function getAccountInfo(userId: string) {
  if (appMode() === "mock") return { connected: false, mock: true as const, username: null, expiresAt: null };
  try {
    const a = await systemStore().get("threads_accounts", userId);
    return { connected: Boolean(a), mock: false as const, username: a?.username ?? null, expiresAt: a?.token_expires_at ?? null };
  } catch {
    return { connected: false, mock: false as const, username: null, expiresAt: null };
  }
}

export async function saveAccount(userId: string, threadsUserId: string, username: string | null, token: string, expiresIn: number) {
  await systemStore().upsert(
    "threads_accounts",
    {
      user_id: userId,
      threads_user_id: threadsUserId,
      username,
      access_token_enc: encryptSecret(token),
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    "user_id",
  );
}

export async function disconnectAccount(userId: string) {
  await systemStore().remove("threads_accounts", { user_id: userId });
}

/** 발행에 쓸 토큰. 만료 7일 이내면 자동 갱신 */
export async function getAccountWithToken(userId: string): Promise<ConnectedAccount | null> {
  const store = systemStore();
  const a = await store.get("threads_accounts", userId);
  if (!a) return null;
  let token = decryptSecret(a.access_token_enc);
  let expiresAt = a.token_expires_at;
  const msLeft = expiresAt ? new Date(expiresAt).getTime() - Date.now() : Infinity;
  if (msLeft <= 0) throw new Error("Threads 액세스 토큰이 만료되었습니다. 설정에서 계정을 다시 연결하세요.");
  if (msLeft < 7 * 86400_000) {
    try {
      const r = await refreshToken(token);
      token = r.access_token;
      expiresAt = new Date(Date.now() + r.expires_in * 1000).toISOString();
      await store.update("threads_accounts", { user_id: userId }, { access_token_enc: encryptSecret(token), token_expires_at: expiresAt });
      await logApi(userId, "threads", "refresh_token", true);
    } catch (e) {
      await logApi(userId, "threads", "refresh_token", false, (e as Error).message);
    }
  }
  return { threadsUserId: a.threads_user_id, username: a.username, expiresAt, token };
}
