import "server-only";
import crypto from "node:crypto";
import { env } from "./env";

function key() {
  const hex = env.tokenKey();
  if (!/^[0-9a-fA-F]{64}$/.test(hex))
    throw new Error("TOKEN_ENCRYPTION_KEY 가 없거나 형식이 잘못되었습니다 (hex 64자, `openssl rand -hex 32`).");
  return Buffer.from(hex, "hex");
}

/** AES-256-GCM. 결과: base64url(iv).base64url(tag).base64url(ciphertext) */
export function encryptSecret(plain: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decryptSecret(payload: string) {
  const [iv, tag, enc] = payload.split(".").map((s) => Buffer.from(s, "base64url"));
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
