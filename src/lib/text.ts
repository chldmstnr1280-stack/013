import crypto from "node:crypto";

/** 비교용 정규화: 공백/문장부호/이모지 차이를 무시 */
export function normalizeText(s: string) {
  return s
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/#\S+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

export function contentHash(body: string) {
  return crypto.createHash("sha256").update(normalizeText(body)).digest("hex").slice(0, 32);
}

/** 문자 3-gram 자카드 유사도 (0~1). 한국어에도 형태소 분석 없이 동작 */
export function similarity(a: string, b: string) {
  const grams = (s: string) => {
    const n = normalizeText(s);
    const set = new Set<string>();
    for (let i = 0; i + 3 <= n.length; i++) set.add(n.slice(i, i + 3));
    return set;
  };
  const A = grams(a);
  const B = grams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

/** 쿠팡 파트너스 subId 등에 쓸 짧은 추적 코드 (영숫자 10자) */
export function trackingCode() {
  return "c" + crypto.randomBytes(6).toString("base64url").replace(/[-_]/g, "x").slice(0, 9).toLowerCase();
}

/** Threads 는 문자 수 기준 500자 제한 (이모지 등 서로게이트 쌍 고려) */
export function charCount(s: string) {
  return [...s].length;
}

export const won = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${n.toLocaleString("ko-KR")}원`;

export const num = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n.toLocaleString("ko-KR");
