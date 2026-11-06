/**
 * 광고 표시 문구.
 * - 공정위 「추천·보증 등에 관한 표시·광고 심사지침」: 경제적 대가를 받는 게시물은 게시물 본문의
 *   처음 또는 끝에 소비자가 쉽게 알 수 있게 표시해야 하며, 댓글(답글)에만 표시하는 것은 부족하다.
 * - 쿠팡 파트너스 운영 정책: 아래 REPLY_DISCLOSURE 문구(또는 동등한 문구)를 링크와 함께 기재.
 * 실제 문구는 최신 정책을 확인하고 필요하면 수정하세요.
 */
export const POST_DISCLOSURE = "#광고 쿠팡 파트너스 활동으로 수수료를 받을 수 있어요";

export const REPLY_DISCLOSURE =
  "이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

export function buildReply(productName: string, affiliateUrl: string) {
  return `${productName} 상품 링크 👉 ${affiliateUrl}\n\n${REPLY_DISCLOSURE}`;
}

export function hasPostDisclosure(body: string) {
  return /#광고|\[광고\]|광고\s*포함|유료\s*광고|쿠팡\s*파트너스\s*활동/.test(body);
}

export function hasReplyDisclosure(reply: string) {
  return /쿠팡\s*파트너스\s*활동의?\s*일환/.test(reply) && /수수료/.test(reply);
}
