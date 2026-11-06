import { buildReply, POST_DISCLOSURE } from "../disclosure";
import { contentHash } from "../text";
import { DEFAULT_SETTINGS } from "../types";
import { emptyDb, type MockDb } from "./mock-store";

export const MOCK_USER_ID = "00000000-0000-4000-8000-000000000001";
export const MOCK_USER_EMAIL = "mock@example.local";

const iso = (offsetDays: number, hour = 9) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCHours(hour - 9, 0, 0, 0); // KST 기준 시각
  return d.toISOString();
};

/** 모의 모드 초기 데이터. 모든 행은 is_mock=true / source='mock' 로 표시된다. */
export function mockSeed(): MockDb {
  const db = emptyDb();
  const u = MOCK_USER_ID;
  const now = new Date().toISOString();

  const products = [
    {
      id: "10000000-0000-4000-8000-000000000001",
      name: "[모의] 접이식 실리콘 밀폐용기 4종 세트",
      category: "주방용품",
      price: 18900,
      features: ["접으면 높이 약 2cm로 수납", "전자레인지 사용 가능(뚜껑 제외)", "4가지 크기 구성"],
      coupang_url: "https://www.coupang.com/vp/products/0000000001",
      affiliate_url: "https://link.coupang.com/a/MOCK001",
      image_rights: "unknown",
    },
    {
      id: "10000000-0000-4000-8000-000000000002",
      name: "[모의] 무선 미니 핸디 청소기",
      category: "생활가전",
      price: null,
      features: ["USB-C 충전", "본체 무게 약 600g", "틈새 노즐 포함"],
      coupang_url: "https://www.coupang.com/vp/products/0000000002",
      affiliate_url: "https://link.coupang.com/a/MOCK002",
      image_rights: "partners_provided",
    },
    {
      id: "10000000-0000-4000-8000-000000000003",
      name: "[모의] 극세사 수면 양말 5켤레",
      category: "패션잡화",
      price: 9900,
      features: ["극세사 소재", "프리사이즈(230~260mm)", "5가지 색상"],
      coupang_url: "https://www.coupang.com/vp/products/0000000003",
      affiliate_url: "https://link.coupang.com/a/MOCK003",
      image_rights: "own",
    },
  ];
  db.products = products.map((p) => ({
    ...p,
    user_id: u,
    image_url: null,
    info_verified_at: now.slice(0, 10),
    notes: "모의 데이터입니다. 실제 상품이 아닙니다.",
    is_mock: true,
    created_at: now,
    updated_at: now,
  }));

  db.reference_posts = [
    {
      id: "20000000-0000-4000-8000-000000000001",
      user_id: u,
      body: "자취방 주방이 좁아서 늘 고민이었는데, 요즘은 '접히는' 살림템 위주로 고르고 있어요. 쓸 땐 펴고, 안 쓸 땐 납작하게.",
      note: "모의 참고 게시물",
      is_mock: true,
      created_at: now,
    },
  ];

  const mk = (
    id: string,
    productIdx: number,
    type: string,
    body: string,
    status: string,
    code: string,
  ) => {
    const p = products[productIdx];
    const fullBody = `${body}\n\n${POST_DISCLOSURE}`;
    return {
      id,
      user_id: u,
      product_id: p.id,
      content_type: type,
      body: fullBody,
      reply_text: buildReply(p.name, p.affiliate_url),
      image_url: null,
      status,
      content_hash: contentHash(fullBody),
      tracking_code: code,
      review: {},
      generation: { model: "mock", mock: true, generated_at: now },
      is_mock: true,
      approved_at: status === "draft" ? null : now,
      created_at: now,
      updated_at: now,
    };
  };

  db.contents = [
    mk("30000000-0000-4000-8000-000000000001", 0, "problem_solving",
      "반찬통이 서랍 하나를 통째로 차지하고 있다면, 접이식 용기를 한 번 고려해 볼 만해요. 접으면 높이가 약 2cm라 납작하게 겹쳐 둘 수 있어요.",
      "published", "cmock00001"),
    mk("30000000-0000-4000-8000-000000000002", 0, "checklist",
      "실리콘 밀폐용기 고르기 전 체크할 것 3가지\n1. 뚜껑까지 전자레인지 되는지 (이 제품은 뚜껑 제외)\n2. 내가 자주 쓰는 크기 구성인지\n3. 세척할 때 접힌 틈 관리가 편한지",
      "published", "cmock00002"),
    mk("30000000-0000-4000-8000-000000000003", 2, "seasonal",
      "아침저녁으로 바닥이 차가워지는 때예요. 발이 시려서 잠을 설친다면 수면 양말을 미리 꺼내 두세요. 극세사 소재 5켤레 구성이라 번갈아 신기 좋아요.",
      "scheduled", "cmock00003"),
    mk("30000000-0000-4000-8000-000000000004", 1, "feature",
      "책상 위 지우개 가루, 차 시트 틈 과자 부스러기. 큰 청소기 꺼내기 애매할 때 쓰는 핸디 청소기예요. 본체 약 600g, USB-C 충전이라 케이블 하나로 해결돼요.",
      "draft", "cmock00004"),
  ];

  const job = (id: string, contentIdx: number, status: string, scheduled: string, extra: Record<string, unknown> = {}) => ({
    id,
    user_id: u,
    content_id: db.contents[contentIdx].id,
    content_hash: db.contents[contentIdx].content_hash,
    scheduled_at: scheduled,
    status,
    attempts: status === "published" ? 1 : 0,
    max_attempts: 3,
    next_attempt_at: null,
    last_error: null,
    threads_media_id: status === "published" ? `mock_media_${id.slice(-4)}` : null,
    threads_reply_id: status === "published" ? `mock_reply_${id.slice(-4)}` : null,
    reply_error: null,
    permalink: null,
    published_at: status === "published" ? scheduled : null,
    is_mock: true,
    created_at: now,
    updated_at: now,
    ...extra,
  });
  db.publish_jobs = [
    job("40000000-0000-4000-8000-000000000001", 0, "published", iso(-3, 9)),
    job("40000000-0000-4000-8000-000000000002", 1, "published", iso(-2, 20)),
    job("40000000-0000-4000-8000-000000000003", 2, "pending", iso(1, 20)),
  ];

  db.post_insights = [
    { id: "50000000-0000-4000-8000-000000000001", user_id: u, job_id: db.publish_jobs[0].id, content_id: db.contents[0].id, views: 1240, likes: 38, replies: 6, reposts: 2, quotes: 0, source: "mock", fetched_at: now },
    { id: "50000000-0000-4000-8000-000000000002", user_id: u, job_id: db.publish_jobs[1].id, content_id: db.contents[1].id, views: 860, likes: 21, replies: 3, reposts: 1, quotes: 1, source: "mock", fetched_at: now },
  ];

  db.affiliate_metrics = [
    { id: "60000000-0000-4000-8000-000000000001", user_id: u, metric_date: iso(-3).slice(0, 10), product_id: products[0].id, content_id: db.contents[0].id, sub_id: "cmock00001", clicks: 54, orders: 3, commission: 1700, source: "mock", import_batch: "mock-seed", created_at: now },
    { id: "60000000-0000-4000-8000-000000000002", user_id: u, metric_date: iso(-2).slice(0, 10), product_id: products[0].id, content_id: db.contents[1].id, sub_id: "cmock00002", clicks: 31, orders: null, commission: null, source: "mock", import_batch: "mock-seed", created_at: now },
  ];

  db.settings = [{ user_id: u, ...DEFAULT_SETTINGS, updated_at: now }];
  db.notifications = [
    { id: "70000000-0000-4000-8000-000000000001", user_id: u, level: "info", message: "모의 모드로 실행 중입니다. 표시되는 모든 수치는 테스트용 모의 데이터입니다.", read: false, created_at: now },
  ];
  return db;
}
