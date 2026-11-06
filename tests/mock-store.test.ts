import { describe, expect, it } from "vitest";
import { MockStore } from "@/lib/store/mock-store";
import { UniqueViolation } from "@/lib/store/types";

describe("MockStore", () => {
  it("enforces one active job per content and one published per hash", async () => {
    const s = new MockStore(null);
    const base = { user_id: "u", content_id: "c1", content_hash: "h", scheduled_at: new Date().toISOString(), attempts: 0, max_attempts: 3 };
    const [j] = await s.insert("publish_jobs", [{ ...base, status: "pending" }]);
    await expect(s.insert("publish_jobs", [{ ...base, status: "pending" }])).rejects.toBeInstanceOf(UniqueViolation);
    await s.update("publish_jobs", { id: j.id }, { status: "published" });
    await expect(s.insert("publish_jobs", [{ ...base, content_id: "c2", status: "published" }])).rejects.toBeInstanceOf(UniqueViolation);
    await expect(s.insert("publish_jobs", [{ ...base, content_id: "c2", status: "cancelled" }])).resolves.toHaveLength(1);
  });
  it("conditional update only claims once", async () => {
    const s = new MockStore(null);
    const [j] = await s.insert("publish_jobs", [{ user_id: "u", content_id: "c", content_hash: "h", status: "pending", attempts: 0 }]);
    const a = await s.update("publish_jobs", { id: j.id, status: "pending", attempts: 0 }, { status: "processing", attempts: 1 });
    const b = await s.update("publish_jobs", { id: j.id, status: "pending", attempts: 0 }, { status: "processing", attempts: 1 });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(0);
  });
  it("supports query filters", async () => {
    const s = new MockStore(null);
    await s.insert("api_logs", [
      { provider: "a", action: "x", ok: true, created_at: "2026-01-01" },
      { provider: "b", action: "y", ok: false, created_at: "2026-01-02" },
    ]);
    expect((await s.list("api_logs", { eq: { ok: false } })).map((r) => r.provider)).toEqual(["b"]);
    expect((await s.list("api_logs", { order: { column: "created_at", ascending: false }, limit: 1 }))[0].provider).toBe("b");
    expect(await s.list("api_logs", { lte: { created_at: "2026-01-01" } })).toHaveLength(1);
  });
});
