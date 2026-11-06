import type { TableMap, TableName } from "../types";

export type Primitive = string | number | boolean | null;

export interface Query {
  eq?: Record<string, Primitive>;
  neq?: Record<string, Primitive>;
  in?: Record<string, Primitive[]>;
  gte?: Record<string, Primitive>;
  lte?: Record<string, Primitive>;
  lt?: Record<string, Primitive>;
  /** column IS NULL (true) / IS NOT NULL (false) */
  isNull?: Record<string, boolean>;
  order?: { column: string; ascending?: boolean };
  limit?: number;
}

/** DB 고유 제약 위반 (Postgres 23505 와 동일 의미) */
export class UniqueViolation extends Error {
  code = "23505";
}

/**
 * 저장소 추상화. mock(JSON 파일) 과 live(Supabase) 가 같은 인터페이스를 구현한다.
 * update 는 match 조건에 맞는 행만 갱신하고 갱신된 행을 반환한다 → 조건부 갱신으로 원자적 '선점(claim)' 구현.
 */
export interface Store {
  readonly mode: "mock" | "live";
  list<T extends TableName>(table: T, q?: Query): Promise<TableMap[T][]>;
  get<T extends TableName>(table: T, id: string): Promise<TableMap[T] | null>;
  insert<T extends TableName>(table: T, rows: Partial<TableMap[T]>[]): Promise<TableMap[T][]>;
  update<T extends TableName>(
    table: T,
    match: Record<string, Primitive>,
    patch: Partial<TableMap[T]>,
  ): Promise<TableMap[T][]>;
  upsert<T extends TableName>(table: T, row: Partial<TableMap[T]>, onConflict: string): Promise<TableMap[T]>;
  remove<T extends TableName>(table: T, match: Record<string, Primitive>): Promise<void>;
}

/** 요청 컨텍스트: 저장소 + 현재 사용자 */
export interface Ctx {
  store: Store;
  userId: string;
  email: string | null;
}
