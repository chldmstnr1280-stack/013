import { describe, expect, it } from "vitest";
import { buildAnalytics, sumNullable } from "@/lib/analytics";
import { parseCsv, parseMetricsCsv } from "@/lib/csv";

describe("csv", () => {
  it("parses quoted fields", () => {
    expect(parseCsv('a,b\n"x,1","y ""q"""\n')).toEqual([["a", "b"], ["x,1", 'y "q"']]);
  });
  it("maps Korean headers and keeps blanks as null", () => {
    const { rows, errors } = parseMetricsCsv("﻿날짜,채널아이디,클릭수,주문수,수수료\n2026.11.01,cabc,1,234,,1,200원\n");
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ date: "2026-11-01", sub_id: "cabc", clicks: 1 });
    const r2 = parseMetricsCsv("date,sub_id,clicks,orders,commission\n2026-11-01,c1,10,,\n").rows[0];
    expect(r2.orders).toBeNull();
    expect(r2.commission).toBeNull();
  });
  it("requires date column", () => {
    expect(parseMetricsCsv("clicks\n1\n").errors[0]).toContain("date");
  });
});

describe("analytics", () => {
  it("sumNullable distinguishes unmeasured from zero", () => {
    expect(sumNullable([null, undefined])).toBeNull();
    expect(sumNullable([0, null])).toBe(0);
    expect(sumNullable([1, 2, null])).toBe(3);
  });
  it("aggregates by product and type without inventing values", () => {
    const now = new Date().toISOString();
    const product = { id: "p1", name: "P", user_id: "u" } as never;
    const content = { id: "c1", product_id: "p1", content_type: "feature", body: "b", tracking_code: "t" } as never;
    const job = { id: "j1", content_id: "c1", status: "published", published_at: now, is_mock: false } as never;
    const a = buildAnalytics({
      products: [product],
      contents: [content],
      jobs: [job],
      insights: [{ job_id: "j1", content_id: "c1", views: 100, likes: 3, replies: null, reposts: null, quotes: null, source: "threads_api" } as never],
      metrics: [],
    });
    expect(a.total.views).toBe(100);
    expect(a.total.replies).toBeNull();
    expect(a.total.clicks).toBeNull();
    expect(a.byType[0]).toMatchObject({ type: "feature", posts: 1, reactions: 3 });
    expect(a.byProduct[0].posts).toBe(1);
  });
});
