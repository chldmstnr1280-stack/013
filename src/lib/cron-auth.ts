import "server-only";
import crypto from "node:crypto";
import { appMode, env } from "./env";

/** Vercel Cron 은 Authorization: Bearer <CRON_SECRET> 헤더를 보낸다 */
export function cronAuthorized(req: Request) {
  const secret = env.cronSecret();
  if (!secret) return appMode() === "mock"; // 모의 모드 로컬 테스트만 무인증 허용
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
