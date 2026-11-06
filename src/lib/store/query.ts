import type { Primitive, Query } from "./types";

type Row = Record<string, unknown>;

const cmp = (a: unknown, b: unknown) => {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return (a as Primitive)! < (b as Primitive)! ? -1 : 1;
};

export function matches(row: Row, match: Record<string, Primitive>) {
  return Object.entries(match).every(([k, v]) => (row[k] ?? null) === v);
}

/** 메모리 상의 행 배열에 Query 를 적용 (mock 저장소용) */
export function applyQuery<T extends Row>(rows: T[], q: Query = {}): T[] {
  let out = rows.filter((r) => {
    if (q.eq && !matches(r, q.eq)) return false;
    if (q.neq && Object.entries(q.neq).some(([k, v]) => (r[k] ?? null) === v)) return false;
    if (q.in && Object.entries(q.in).some(([k, vs]) => !vs.includes((r[k] ?? null) as Primitive)))
      return false;
    if (q.gte && Object.entries(q.gte).some(([k, v]) => cmp(r[k], v) < 0)) return false;
    if (q.lte && Object.entries(q.lte).some(([k, v]) => cmp(r[k], v) > 0)) return false;
    if (q.lt && Object.entries(q.lt).some(([k, v]) => cmp(r[k], v) >= 0)) return false;
    if (q.isNull && Object.entries(q.isNull).some(([k, isNull]) => (r[k] == null) !== isNull))
      return false;
    return true;
  });
  if (q.order) {
    const { column, ascending = true } = q.order;
    out = [...out].sort((a, b) => cmp(a[column], b[column]) * (ascending ? 1 : -1));
  }
  if (q.limit !== undefined) out = out.slice(0, q.limit);
  return out;
}
