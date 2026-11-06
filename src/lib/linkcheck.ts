import "server-only";
import { appMode } from "./env";
import type { LinkCheck } from "./review";

/** 제휴 링크 접속 확인. 리디렉션은 따라가지 않고 첫 응답 코드만 본다. */
export async function checkLink(url: string): Promise<LinkCheck> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { checked: true, ok: false, message: "URL 형식 오류" };
  }
  if (u.protocol !== "https:") return { checked: true, ok: false, message: "https 링크가 아닙니다." };
  if (appMode() === "mock")
    return { checked: true, inconclusive: true, message: "모의 모드: 실제로 접속하지 않았습니다. 형식만 확인됨." };
  // SSRF 방지: 쿠팡 도메인만 서버에서 접속
  if (!/(^|\.)coupang\.com$/.test(u.hostname))
    return { checked: true, inconclusive: true, message: "쿠팡 외 도메인은 서버에서 접속하지 않습니다. 직접 확인하세요." };
  try {
    const res = await fetch(u, { method: "GET", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (res.status >= 200 && res.status < 400) return { checked: true, ok: true, status: res.status, message: `접속 확인 (HTTP ${res.status})` };
    if (res.status === 403 || res.status === 429)
      return { checked: true, inconclusive: true, status: res.status, message: `자동 접속이 차단되었습니다 (HTTP ${res.status}). 브라우저에서 직접 열어 확인하세요.` };
    return { checked: true, ok: false, status: res.status, message: `접속 실패 (HTTP ${res.status})` };
  } catch (e) {
    return { checked: true, inconclusive: true, message: `접속 확인 실패: ${(e as Error).message}` };
  }
}
