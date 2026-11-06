import { hasPostDisclosure, hasReplyDisclosure } from "./disclosure";
import { charCount, similarity } from "./text";
import type { CheckKey, CheckLevel, CheckResult, LinkCheck, Product, Review } from "./types";
import { THREADS_MAX_CHARS } from "./types";

export const CHECK_LABELS: Record<CheckKey, string> = {
  accuracy: "상품 정보 정확성",
  duplicate: "기존 게시물과의 중복",
  exaggeration: "과장 광고 여부",
  disclosure: "제휴 광고 표시",
  image_rights: "이미지 사용 권한",
  link: "링크 유효성",
};
export const CHECK_KEYS = Object.keys(CHECK_LABELS) as CheckKey[];

export type { LinkCheck };

export interface ReviewInput {
  body: string;
  reply_text: string;
  image_url: string | null;
  product: Pick<Product, "name" | "price" | "features" | "affiliate_url" | "image_url" | "image_rights" | "info_verified_at">;
  /** 비교 대상: 다른 콘텐츠 본문 + 사용자 참고 게시물 */
  others: { label: string; body: string }[];
  requireReply: boolean;
  link?: LinkCheck;
  now?: Date;
}

const EXPERIENCE = /(써\s*봤|써\s*보니|써\s*보고|사용해\s*보니|사용해\s*봤|직접\s*(써|사용)|구매했|샀는데|샀어요|내돈내산|한\s*달\s*(째|동안)\s*(쓰|사용)|사용\s*후기|실사용)/;
const SALES = /(판매량|누적\s*판매|\d+\s*만\s*(개|명|건)|베스트\s*셀러|품절\s*대란|완판|리뷰\s*\d+)/;
const HARD_EXAGGERATION = /(치료|완치|특효|예방\s*효과|100\s*%|백\s*퍼센트|무조건|부작용\s*(이\s*)?없|효과\s*보장|평생\s*(사용|보장)|절대\s*(안|없))/;
const SOFT_EXAGGERATION = /(최고|최저가|역대급|업계\s*1위|1위|완벽|기적|인생템|끝판왕|미친\s*가성비|역대\s*최)/;

const worst = (levels: CheckLevel[]): CheckLevel =>
  levels.includes("fail") ? "fail" : levels.includes("warn") ? "warn" : "pass";

function result(key: CheckKey, items: [CheckLevel, string][]): CheckResult {
  return {
    key,
    label: CHECK_LABELS[key],
    level: worst(items.map((i) => i[0])),
    messages: items.length ? items.map((i) => i[1]) : ["문제 없음"],
  };
}

export function runChecks(i: ReviewInput): CheckResult[] {
  const now = i.now ?? new Date();
  const featuresText = i.product.features.join(" ");

  // 1. 정확성
  const acc: [CheckLevel, string][] = [];
  if (charCount(i.body) > THREADS_MAX_CHARS) acc.push(["fail", `본문이 ${charCount(i.body)}자입니다 (Threads 최대 ${THREADS_MAX_CHARS}자).`]);
  if (charCount(i.reply_text) > THREADS_MAX_CHARS) acc.push(["fail", `답글이 ${THREADS_MAX_CHARS}자를 넘습니다.`]);
  for (const m of i.body.matchAll(/(\d[\d,]*)\s*원/g)) {
    const amount = Number(m[1].replace(/,/g, ""));
    if (i.product.price === null) acc.push(["fail", `가격 '${m[0]}' 이 언급되었지만 등록된 확인 가격이 없습니다.`]);
    else if (amount !== i.product.price) acc.push(["fail", `본문 금액 '${m[0]}' 이 등록 가격(${i.product.price.toLocaleString()}원)과 다릅니다.`]);
    else acc.push(["warn", "가격은 수시로 바뀝니다. 발행 시점 가격을 다시 확인하세요."]);
  }
  for (const m of i.body.matchAll(/\d+(\.\d+)?\s*%/g)) {
    if (!featuresText.includes(m[0].replace(/\s/g, ""))) acc.push(["fail", `확인되지 않은 수치 '${m[0]}' (할인율·효능 등)가 있습니다.`]);
  }
  if (SALES.test(i.body)) acc.push(["fail", `판매량·인기 관련 표현('${i.body.match(SALES)![0]}')은 확인된 자료 없이 쓸 수 없습니다.`]);
  if (EXPERIENCE.test(i.body)) acc.push(["fail", `실제 사용/구매 경험처럼 보이는 표현('${i.body.match(EXPERIENCE)![0]}')이 있습니다. 직접 사용한 상품이 아니라면 삭제하세요.`]);
  if (!i.product.info_verified_at) acc.push(["warn", "상품 정보 확인일이 없습니다."]);
  else {
    const days = (now.getTime() - new Date(i.product.info_verified_at).getTime()) / 86400_000;
    if (days > 30) acc.push(["warn", `상품 정보 확인일이 ${Math.floor(days)}일 전입니다. 최신 정보인지 확인하세요.`]);
  }

  // 2. 중복
  const dup: [CheckLevel, string][] = [];
  let best = { score: 0, label: "" };
  for (const o of i.others) {
    const s = similarity(i.body, o.body);
    if (s > best.score) best = { score: s, label: o.label };
  }
  if (best.score >= 0.6) dup.push(["fail", `'${best.label}' 과 매우 비슷합니다 (유사도 ${(best.score * 100).toFixed(0)}%).`]);
  else if (best.score >= 0.35) dup.push(["warn", `'${best.label}' 과 일부 겹칩니다 (유사도 ${(best.score * 100).toFixed(0)}%).`]);

  // 3. 과장
  const ex: [CheckLevel, string][] = [];
  const hard = i.body.match(HARD_EXAGGERATION);
  if (hard) ex.push(["fail", `효능 단정·절대적 표현 '${hard[0]}' 은 표시광고법 위반 소지가 있습니다.`]);
  const soft = i.body.match(SOFT_EXAGGERATION);
  if (soft) ex.push(["warn", `'${soft[0]}' 같은 최상급 표현은 근거가 없으면 과장 광고가 될 수 있습니다.`]);

  // 4. 광고 표시
  const dis: [CheckLevel, string][] = [];
  if (!hasPostDisclosure(i.body)) dis.push(["fail", "본문에 광고 표시(#광고 / 쿠팡 파트너스 활동 문구)가 없습니다. 답글에만 표시하는 것은 부족합니다."]);
  if (i.requireReply) {
    if (!hasReplyDisclosure(i.reply_text)) dis.push(["fail", "답글에 쿠팡 파트너스 수수료 안내 문구가 없습니다."]);
    if (i.product.affiliate_url && !i.reply_text.includes(i.product.affiliate_url))
      dis.push(["warn", "답글에 등록된 제휴 링크가 포함되어 있지 않습니다."]);
  }

  // 5. 이미지 권한
  const img: [CheckLevel, string][] = [];
  const image = i.image_url;
  if (image) {
    if (i.product.image_rights === "unknown") img.push(["fail", "이미지 사용 권한이 확인되지 않았습니다. 상품 관리에서 권한을 지정하거나 이미지를 제외하세요."]);
    if (!/^https:\/\//.test(image)) img.push(["fail", "Threads 는 공개 https 이미지 URL 만 게시할 수 있습니다."]);
  } else img.push(["pass", "이미지 없이 텍스트로 게시합니다."]);

  // 6. 링크
  const ln: [CheckLevel, string][] = [];
  const url = i.product.affiliate_url;
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    /* invalid */
  }
  if (!url) ln.push(["fail", "제휴 링크가 등록되지 않았습니다."]);
  else if (!host) ln.push(["fail", "제휴 링크 형식이 올바르지 않습니다."]);
  else if (!/(^|\.)coupang\.com$/.test(host)) ln.push(["warn", `쿠팡 도메인이 아닌 링크입니다 (${host}).`]);
  else if (host !== "link.coupang.com") ln.push(["warn", "link.coupang.com 형식의 파트너스 링크가 아닙니다. 수익이 집계되지 않을 수 있습니다."]);
  if (url && host) {
    if (!i.link?.checked) ln.push(["warn", "링크 접속 확인을 아직 하지 않았습니다."]);
    else if (i.link.inconclusive) ln.push(["warn", i.link.message ?? "자동 확인이 불가능합니다. 브라우저에서 직접 열어 확인하세요."]);
    else if (i.link.ok) ln.push(["pass", i.link.message ?? `접속 확인 (HTTP ${i.link.status})`]);
    else ln.push(["fail", i.link.message ?? `접속 실패 (HTTP ${i.link.status ?? "?"})`]);
  }

  return [
    result("accuracy", acc),
    result("duplicate", dup),
    result("exaggeration", ex),
    result("disclosure", dis),
    result("image_rights", img.filter((x) => x[0] !== "pass").length ? img.filter((x) => x[0] !== "pass") : img),
    result("link", ln.filter((x) => x[0] !== "pass").length ? ln.filter((x) => x[0] !== "pass") : ln),
  ];
}

/** 승인 가능 조건: 자동 검사 'fail' 이 없고, 6개 항목을 사용자가 모두 직접 확인했을 것 */
export function canApprove(review: Review): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!review.checks?.length) reasons.push("자동 검사를 먼저 실행하세요.");
  for (const c of review.checks ?? []) if (c.level === "fail") reasons.push(`${c.label}: 수정이 필요합니다.`);
  for (const k of CHECK_KEYS) if (!review.confirmed?.[k]) reasons.push(`${CHECK_LABELS[k]} 항목을 직접 확인해 체크하세요.`);
  return { ok: reasons.length === 0, reasons };
}
