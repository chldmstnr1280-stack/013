import type { AffiliateMetric, Content, ContentType, DataSource, PostInsight, Product, PublishJob } from "./types";

/** null 은 '측정 안 됨' — 합산 시 하나라도 값이 있으면 그 합, 모두 null 이면 null */
export function sumNullable(values: (number | null | undefined)[]): number | null {
  let seen = false;
  let total = 0;
  for (const v of values) {
    if (v === null || v === undefined) continue;
    seen = true;
    total += v;
  }
  return seen ? total : null;
}

export interface Perf {
  posts: number;
  views: number | null;
  reactions: number | null; // likes + reposts + quotes
  replies: number | null;
  clicks: number | null;
  orders: number | null;
  commission: number | null;
  sources: DataSource[];
}

export interface PostPerf extends Perf {
  content: Content;
  product: Product | undefined;
  job: PublishJob;
}

function perf(items: { insight?: PostInsight; metrics: AffiliateMetric[] }[]): Perf {
  const ins = items.map((i) => i.insight).filter(Boolean) as PostInsight[];
  const mets = items.flatMap((i) => i.metrics);
  const reactions = ins.map((i) => sumNullable([i.likes, i.reposts, i.quotes]));
  return {
    posts: items.length,
    views: sumNullable(ins.map((i) => i.views)),
    reactions: sumNullable(reactions),
    replies: sumNullable(ins.map((i) => i.replies)),
    clicks: sumNullable(mets.map((m) => m.clicks)),
    orders: sumNullable(mets.map((m) => m.orders)),
    commission: sumNullable(mets.map((m) => m.commission)),
    sources: [...new Set([...ins.map((i) => i.source), ...mets.map((m) => m.source)])],
  };
}

export function buildAnalytics(d: {
  products: Product[];
  contents: Content[];
  jobs: PublishJob[];
  insights: PostInsight[];
  metrics: AffiliateMetric[];
}) {
  const productById = new Map(d.products.map((p) => [p.id, p]));
  const contentById = new Map(d.contents.map((c) => [c.id, c]));
  const insightByJob = new Map(d.insights.map((i) => [i.job_id, i]));
  const published = d.jobs.filter((j) => j.status === "published");

  const posts: PostPerf[] = published
    .filter((j) => contentById.has(j.content_id))
    .map((j) => {
      const content = contentById.get(j.content_id)!;
      const metrics = d.metrics.filter((m) => m.content_id === content.id);
      return { ...perf([{ insight: insightByJob.get(j.id), metrics }]), content, product: productById.get(content.product_id), job: j };
    })
    .sort((a, b) => (b.job.published_at ?? "").localeCompare(a.job.published_at ?? ""));

  // 상품별: 게시물 연결 실적 + 게시물과 연결되지 않은 상품 단위 실적(CSV 상품명 매칭)
  const byProduct = d.products
    .map((p) => {
      const items = posts.filter((x) => x.content.product_id === p.id).map((x) => ({
        insight: insightByJob.get(x.job.id),
        metrics: d.metrics.filter((m) => m.content_id === x.content.id),
      }));
      const productOnly = d.metrics.filter((m) => m.product_id === p.id && !m.content_id);
      const r = perf([...items, { metrics: productOnly }]);
      return { product: p, ...r, posts: items.length };
    })
    .filter((r) => r.posts > 0 || r.clicks !== null || r.commission !== null);

  const types = [...new Set(posts.map((p) => p.content.content_type))] as ContentType[];
  const byType = types.map((t) => {
    const items = posts.filter((x) => x.content.content_type === t).map((x) => ({
      insight: insightByJob.get(x.job.id),
      metrics: d.metrics.filter((m) => m.content_id === x.content.id),
    }));
    return { type: t, ...perf(items) };
  });

  const unattributed = perf([{ metrics: d.metrics.filter((m) => !m.content_id && !m.product_id) }]);
  const total = perf([
    ...posts.map((x) => ({ insight: insightByJob.get(x.job.id), metrics: [] })),
    { metrics: d.metrics },
  ]);
  total.posts = posts.length;

  return { posts, byProduct, byType, unattributed, total };
}

/** 1,000 회 조회당 클릭 등 비율. 분모/분자 중 측정 안 된 값이 있으면 null */
export function ratio(a: number | null, b: number | null) {
  if (a === null || b === null || b === 0) return null;
  return a / b;
}
