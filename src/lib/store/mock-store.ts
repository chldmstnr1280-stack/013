import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { TableMap, TableName } from "../types";
import { applyQuery, matches } from "./query";
import { UniqueViolation, type Primitive, type Query, type Store } from "./types";

type Row = Record<string, unknown>;
export type MockDb = { [K in TableName]: Row[] };

const PK: Partial<Record<TableName, string>> = {
  settings: "user_id",
  threads_accounts: "user_id",
  oauth_states: "state",
};
const pkOf = (t: TableName) => PK[t] ?? "id";

/** supabase/migrations 의 고유 인덱스를 모의 저장소에서도 동일하게 강제 */
const UNIQUE: Partial<Record<TableName, { cols: string[]; where?: (r: Row) => boolean }[]>> = {
  contents: [{ cols: ["tracking_code"] }],
  publish_jobs: [
    { cols: ["content_id"], where: (r) => r.status !== "cancelled" },
    { cols: ["user_id", "content_hash"], where: (r) => r.status === "published" },
  ],
  post_insights: [{ cols: ["job_id"] }],
};

const TIMESTAMPED = new Set<TableName>(["products", "contents", "publish_jobs", "settings", "threads_accounts"]);

export function emptyDb(): MockDb {
  return {
    products: [],
    reference_posts: [],
    contents: [],
    publish_jobs: [],
    settings: [],
    threads_accounts: [],
    post_insights: [],
    affiliate_metrics: [],
    api_logs: [],
    notifications: [],
    oauth_states: [],
  };
}

/**
 * 로컬 JSON 파일 저장소 (모의 모드 전용).
 * 모든 행은 저장 시 is_mock 성격을 가지며, 실제 운영 DB(Supabase)와 물리적으로 분리된다.
 */
export class MockStore implements Store {
  readonly mode = "mock" as const;
  private db: MockDb | null = null;

  constructor(
    private file: string | null,
    private seed: () => MockDb = emptyDb,
  ) {}

  private load(): MockDb {
    if (this.db) return this.db;
    if (this.file && fs.existsSync(this.file)) {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8")) as Partial<MockDb>;
      this.db = { ...emptyDb(), ...parsed };
    } else {
      this.db = this.seed();
      this.save();
    }
    return this.db;
  }

  private save() {
    if (!this.file || !this.db) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    fs.renameSync(tmp, this.file);
  }

  /** 다른 요청이 파일을 바꿨을 수 있으므로 매 작업마다 다시 읽음 */
  private fresh(): MockDb {
    if (this.file) this.db = null;
    return this.load();
  }

  private checkUnique(table: TableName, rows: Row[], candidate: Row) {
    for (const u of UNIQUE[table] ?? []) {
      if (u.where && !u.where(candidate)) continue;
      const clash = rows.some(
        (r) =>
          r !== candidate &&
          r[pkOf(table)] !== candidate[pkOf(table)] &&
          (!u.where || u.where(r)) &&
          u.cols.every((c) => r[c] === candidate[c]),
      );
      if (clash) throw new UniqueViolation(`duplicate key on ${table}(${u.cols.join(",")})`);
    }
    const pk = pkOf(table);
    if (rows.some((r) => r !== candidate && r[pk] === candidate[pk]))
      throw new UniqueViolation(`duplicate primary key on ${table}`);
  }

  async list<T extends TableName>(table: T, q?: Query) {
    return structuredClone(applyQuery(this.fresh()[table], q)) as unknown as TableMap[T][];
  }

  async get<T extends TableName>(table: T, id: string) {
    const row = this.fresh()[table].find((r) => r[pkOf(table)] === id);
    return (row ? structuredClone(row) : null) as TableMap[T] | null;
  }

  async insert<T extends TableName>(table: T, rows: Partial<TableMap[T]>[]) {
    const db = this.fresh();
    const now = new Date().toISOString();
    const created: Row[] = [];
    for (const input of rows) {
      const row: Row = { ...(input as Row) };
      if (pkOf(table) === "id" && !row.id) row.id = crypto.randomUUID();
      row.created_at ??= now;
      if (TIMESTAMPED.has(table)) row.updated_at ??= now;
      this.checkUnique(table, [...db[table], ...created], row);
      created.push(row);
    }
    db[table].push(...created);
    this.save();
    return structuredClone(created) as unknown as TableMap[T][];
  }

  async update<T extends TableName>(table: T, match: Record<string, Primitive>, patch: Partial<TableMap[T]>) {
    const db = this.fresh();
    const now = new Date().toISOString();
    const hit = db[table].filter((r) => matches(r, match));
    const next = hit.map((r) => ({ ...r, ...(patch as Row), ...(TIMESTAMPED.has(table) ? { updated_at: now } : {}) }));
    const others = db[table].filter((r) => !hit.includes(r));
    for (const n of next) this.checkUnique(table, [...others, ...next], n);
    db[table] = [...others, ...next];
    this.save();
    return structuredClone(next) as unknown as TableMap[T][];
  }

  async upsert<T extends TableName>(table: T, row: Partial<TableMap[T]>, onConflict: string) {
    const key = (row as Row)[onConflict] as Primitive;
    const existing = this.fresh()[table].find((r) => r[onConflict] === key);
    if (existing) {
      const [u] = await this.update(table, { [onConflict]: key }, row);
      return u;
    }
    const [c] = await this.insert(table, [row]);
    return c;
  }

  async remove<T extends TableName>(table: T, match: Record<string, Primitive>) {
    const db = this.fresh();
    db[table] = db[table].filter((r) => !matches(r, match));
    this.save();
  }
}
