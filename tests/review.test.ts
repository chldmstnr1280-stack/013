import { describe, expect, it } from "vitest";
import { buildReply, POST_DISCLOSURE } from "@/lib/disclosure";
import { canApprove, CHECK_KEYS, runChecks } from "@/lib/review";

const product = {
  name: "밀폐용기",
  price: 18900,
  features: ["접으면 높이 약 2cm"],
  affiliate_url: "https://link.coupang.com/a/abc",
  image_url: null,
  image_rights: "unknown" as const,
  info_verified_at: new Date().toISOString().slice(0, 10),
};
const base = (body: string, extra: Partial<Parameters<typeof runChecks>[0]> = {}) =>
  runChecks({
    body: `${body}\n\n${POST_DISCLOSURE}`,
    reply_text: buildReply("밀폐용기", product.affiliate_url),
    image_url: null,
    product,
    others: [],
    requireReply: true,
    link: { checked: true, ok: true, status: 302 },
    ...extra,
  });
const get = (r: ReturnType<typeof runChecks>, k: string) => r.find((c) => c.key === k)!;

describe("runChecks", () => {
  it("passes a clean post", () => {
    const r = base("반찬통 정리가 고민이라면 접이식 용기를 고려해 보세요.");
    expect(r.every((c) => c.level !== "fail")).toBe(true);
  });
  it("flags fabricated experience and sales claims", () => {
    const r = base("한 달째 사용 중인데 진짜 좋아요. 누적 판매 10만 개!");
    expect(get(r, "accuracy").level).toBe("fail");
  });
  it("flags price mismatch and unverified discount", () => {
    expect(get(base("지금 15,000원!"), "accuracy").level).toBe("fail");
    expect(get(base("30% 할인 중"), "accuracy").level).toBe("fail");
    expect(get(base("가격은 18,900원"), "accuracy").level).toBe("warn");
  });
  it("flags exaggeration", () => {
    expect(get(base("무조건 효과 보장"), "exaggeration").level).toBe("fail");
    expect(get(base("가성비 최고"), "exaggeration").level).toBe("warn");
  });
  it("requires disclosure in the post body itself", () => {
    const r = runChecks({ body: "광고 표시 없는 글", reply_text: buildReply("x", product.affiliate_url), image_url: null, product, others: [], requireReply: true });
    expect(get(r, "disclosure").level).toBe("fail");
  });
  it("detects duplicates", () => {
    const text = "반찬통이 서랍 하나를 통째로 차지하고 있다면 접이식 용기를 고려해 볼 만해요";
    const r = base(text, { others: [{ label: "이전 글", body: text }] });
    expect(get(r, "duplicate").level).toBe("fail");
  });
  it("blocks images with unknown rights", () => {
    expect(get(base("글", { image_url: "https://img.example/x.jpg" }), "image_rights").level).toBe("fail");
  });
  it("validates link", () => {
    expect(get(base("글", { link: { checked: true, ok: false, status: 404 } }), "link").level).toBe("fail");
    expect(get(base("글", { link: undefined }), "link").level).toBe("warn");
  });
});

describe("canApprove", () => {
  it("requires no fails and all confirmations", () => {
    const checks = base("깔끔한 글입니다. 접이식 용기 소개.");
    expect(canApprove({ checks }).ok).toBe(false);
    const confirmed = Object.fromEntries(CHECK_KEYS.map((k) => [k, true]));
    expect(canApprove({ checks, confirmed }).ok).toBe(true);
    expect(canApprove({ checks: base("100% 완치"), confirmed }).ok).toBe(false);
  });
});
