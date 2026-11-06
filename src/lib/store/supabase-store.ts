import type { SupabaseClient } from "@supabase/supabase-js";
import type { TableMap, TableName } from "../types";
import { UniqueViolation, type Primitive, type Query, type Store } from "./types";

type PgError = { code?: string; message: string } | null;

function check(error: PgError, ctx: string) {
  if (!error) return;
  if (error.code === "23505") throw new UniqueViolation(`${ctx}: ${error.message}`);
  throw new Error(`${ctx}: ${error.message}`);
}

/** Supabase(Postgres) 저장소. 사용자 클라이언트를 넘기면 RLS 가, service role 을 넘기면 전체 권한이 적용된다. */
export class SupabaseStore implements Store {
  readonly mode = "live" as const;
  constructor(private sb: SupabaseClient) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyFilters(builder: any, q: Query) {
    let b = builder;
    for (const [k, v] of Object.entries(q.eq ?? {})) b = v === null ? b.is(k, null) : b.eq(k, v);
    for (const [k, v] of Object.entries(q.neq ?? {})) b = v === null ? b.not(k, "is", null) : b.neq(k, v);
    for (const [k, v] of Object.entries(q.in ?? {})) b = b.in(k, v);
    for (const [k, v] of Object.entries(q.gte ?? {})) b = b.gte(k, v);
    for (const [k, v] of Object.entries(q.lte ?? {})) b = b.lte(k, v);
    for (const [k, v] of Object.entries(q.lt ?? {})) b = b.lt(k, v);
    for (const [k, isNull] of Object.entries(q.isNull ?? {})) b = isNull ? b.is(k, null) : b.not(k, "is", null);
    if (q.order) b = b.order(q.order.column, { ascending: q.order.ascending ?? true });
    if (q.limit !== undefined) b = b.limit(q.limit);
    return b;
  }

  async list<T extends TableName>(table: T, q: Query = {}) {
    const { data, error } = await this.applyFilters(this.sb.from(table).select("*"), q);
    check(error, `list ${table}`);
    return (data ?? []) as TableMap[T][];
  }

  async get<T extends TableName>(table: T, id: string) {
    const pk = table === "settings" || table === "threads_accounts" ? "user_id" : table === "oauth_states" ? "state" : "id";
    const { data, error } = await this.sb.from(table).select("*").eq(pk, id).maybeSingle();
    check(error, `get ${table}`);
    return (data ?? null) as TableMap[T] | null;
  }

  async insert<T extends TableName>(table: T, rows: Partial<TableMap[T]>[]) {
    const { data, error } = await this.sb.from(table).insert(rows as never).select("*");
    check(error, `insert ${table}`);
    return (data ?? []) as TableMap[T][];
  }

  async update<T extends TableName>(table: T, match: Record<string, Primitive>, patch: Partial<TableMap[T]>) {
    let b = this.sb.from(table).update(patch as never);
    for (const [k, v] of Object.entries(match)) b = v === null ? b.is(k, null) : b.eq(k, v);
    const { data, error } = await b.select("*");
    check(error, `update ${table}`);
    return (data ?? []) as TableMap[T][];
  }

  async upsert<T extends TableName>(table: T, row: Partial<TableMap[T]>, onConflict: string) {
    const { data, error } = await this.sb.from(table).upsert(row as never, { onConflict }).select("*").single();
    check(error, `upsert ${table}`);
    return data as TableMap[T];
  }

  async remove<T extends TableName>(table: T, match: Record<string, Primitive>) {
    let b = this.sb.from(table).delete();
    for (const [k, v] of Object.entries(match)) b = v === null ? b.is(k, null) : b.eq(k, v);
    const { error } = await b;
    check(error, `delete ${table}`);
  }
}
