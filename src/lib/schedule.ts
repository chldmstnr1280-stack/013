import type { JobStatus, PublishJob, Settings } from "./types";
import { MAX_DAILY_LIMIT } from "./types";

/** 특정 시각의 tz 오프셋(ms): 로컬시각 - UTC */
function tzOffsetMs(at: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const v = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** tz 기준 로컬 날짜(YYYY-MM-DD) + 시각(HH:MM) → UTC Date */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - tzOffsetMs(guess, tz);
  t = guess - tzOffsetMs(t, tz); // DST 경계 보정
  return new Date(t);
}

/** UTC 시각 → tz 기준 YYYY-MM-DD */
export function localDate(at: Date | string, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(at),
  );
}

export function localTime(at: Date | string, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(at),
  );
}

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 하루 한도에 포함되는 작업 상태 */
const COUNTED: JobStatus[] = ["pending", "processing", "published"];

export function countOnDay(jobs: Pick<PublishJob, "status" | "scheduled_at">[], date: string, tz: string) {
  return jobs.filter((j) => COUNTED.includes(j.status) && localDate(j.scheduled_at, tz) === date).length;
}

export function effectiveLimit(s: Pick<Settings, "daily_limit">) {
  return Math.max(1, Math.min(MAX_DAILY_LIMIT, s.daily_limit || MAX_DAILY_LIMIT));
}

export function normalizeTimes(times: string[]) {
  return [...new Set(times.map((t) => t.trim()).filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)))].sort();
}

/** 다음 빈 게시 슬롯: 설정된 게시 시간 중, 하루 한도와 기존 예약을 피해서 */
export function nextFreeSlot(
  jobs: Pick<PublishJob, "status" | "scheduled_at">[],
  s: Pick<Settings, "timezone" | "posting_times" | "daily_limit">,
  from: Date = new Date(),
  horizonDays = 60,
): Date | null {
  const times = normalizeTimes(s.posting_times);
  if (!times.length) return null;
  const limit = effectiveLimit(s);
  const minLead = from.getTime() + 2 * 60_000;
  const taken = new Set(jobs.filter((j) => COUNTED.includes(j.status)).map((j) => new Date(j.scheduled_at).toISOString().slice(0, 16)));
  const today = localDate(from, s.timezone);
  for (let i = 0; i < horizonDays; i++) {
    const day = addDays(today, i);
    const used = countOnDay(jobs, day, s.timezone);
    if (used >= limit) continue;
    for (const t of times) {
      const slot = zonedToUtc(day, t, s.timezone);
      if (slot.getTime() < minLead) continue;
      if (taken.has(slot.toISOString().slice(0, 16))) continue;
      return slot;
    }
  }
  return null;
}

/** 재시도 대기 시간: 5분, 10분, 20분 ... (최대 2시간) */
export function backoffMs(attempt: number) {
  return Math.min(5 * 60_000 * 2 ** Math.max(0, attempt - 1), 2 * 3600_000);
}
