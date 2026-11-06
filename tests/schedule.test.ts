import { describe, expect, it } from "vitest";
import { backoffMs, countOnDay, localDate, nextFreeSlot, zonedToUtc } from "@/lib/schedule";

const s = { timezone: "Asia/Seoul", posting_times: ["09:00", "13:00", "20:00"], daily_limit: 3 };

describe("schedule", () => {
  it("converts KST to UTC", () => {
    expect(zonedToUtc("2026-11-06", "09:00", "Asia/Seoul").toISOString()).toBe("2026-11-06T00:00:00.000Z");
    expect(localDate("2026-11-06T16:00:00Z", "Asia/Seoul")).toBe("2026-11-07");
  });
  it("handles DST zones", () => {
    expect(zonedToUtc("2026-07-01", "09:00", "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z");
  });
  it("finds next free slot after now and skips taken slots", () => {
    const from = new Date("2026-11-06T01:00:00Z"); // 10:00 KST
    const first = nextFreeSlot([], s, from)!;
    expect(first.toISOString()).toBe("2026-11-06T04:00:00.000Z"); // 13:00 KST
    const second = nextFreeSlot([{ status: "pending", scheduled_at: first.toISOString() }], s, from)!;
    expect(second.toISOString()).toBe("2026-11-06T11:00:00.000Z"); // 20:00 KST
  });
  it("respects daily limit", () => {
    const from = new Date("2026-11-05T15:30:00Z"); // 11/06 00:30 KST
    const jobs = ["2026-11-06T00:00:00Z", "2026-11-06T04:00:00Z", "2026-11-06T11:00:00Z"].map((t) => ({ status: "published" as const, scheduled_at: t }));
    expect(countOnDay(jobs, "2026-11-06", "Asia/Seoul")).toBe(3);
    expect(nextFreeSlot(jobs, s, from)!.toISOString()).toBe("2026-11-07T00:00:00.000Z");
    expect(nextFreeSlot(jobs.slice(0, 1), { ...s, daily_limit: 1 }, from)!.toISOString()).toBe("2026-11-07T00:00:00.000Z");
  });
  it("ignores cancelled jobs", () => {
    expect(countOnDay([{ status: "cancelled", scheduled_at: "2026-11-06T00:00:00Z" }], "2026-11-06", "Asia/Seoul")).toBe(0);
  });
  it("backs off exponentially", () => {
    expect(backoffMs(1)).toBe(300_000);
    expect(backoffMs(2)).toBe(600_000);
    expect(backoffMs(10)).toBe(7_200_000);
  });
});
