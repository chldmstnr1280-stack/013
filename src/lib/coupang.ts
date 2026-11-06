import "server-only";
import crypto from "node:crypto";
import { env } from "./env";
import { logApi } from "./log";

/**
 * 쿠팡 파트너스 Open API (공식). 파트너스 최종 승인 + API 키 발급을 받은 경우에만 사용 가능.
 * 여기서는 '딥링크(제휴 링크) 생성'만 구현한다. 상품 정보 자동 조회(검색 API)는
 * 사용 권한이 확인된 뒤 같은 서명 함수로 추가할 수 있다.
 * 크롤링·스크래핑은 구현하지 않는다.
 */
const HOST = "https://api-gateway.coupang.com";
const DEEPLINK_PATH = "/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink";

export const coupangEnabled = () => Boolean(env.coupangAccessKey() && env.coupangSecretKey());

/** CEA HMAC-SHA256 서명 헤더 */
export function coupangAuthHeader(method: string, path: string, query = "", now = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  const signedDate = `${String(now.getUTCFullYear()).slice(2)}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}T${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}Z`;
  const message = signedDate + method + path + query;
  const signature = crypto.createHmac("sha256", env.coupangSecretKey()).update(message).digest("hex");
  return `CEA algorithm=HmacSHA256, access-key=${env.coupangAccessKey()}, signed-date=${signedDate}, signature=${signature}`;
}

export async function createDeeplink(userId: string, coupangUrl: string, subId?: string) {
  if (!coupangEnabled()) throw new Error("쿠팡 파트너스 API 키가 설정되지 않았습니다.");
  const res = await fetch(HOST + DEEPLINK_PATH, {
    method: "POST",
    headers: { "content-type": "application/json;charset=UTF-8", Authorization: coupangAuthHeader("POST", DEEPLINK_PATH) },
    body: JSON.stringify({ coupangUrls: [coupangUrl], ...(subId ? { subId } : {}) }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { rCode?: string; rMessage?: string; data?: { shortenUrl?: string }[] };
  const url = json.data?.[0]?.shortenUrl;
  const ok = res.ok && json.rCode === "0" && Boolean(url);
  await logApi(userId, "coupang", "deeplink", ok, ok ? url : json.rMessage ?? `HTTP ${res.status}`, res.status);
  if (!ok) throw new Error(`딥링크 생성 실패: ${json.rMessage ?? res.status}`);
  return url!;
}
