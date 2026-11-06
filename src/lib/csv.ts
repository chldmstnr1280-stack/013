/** 최소 CSV 파서 (RFC4180: 따옴표, 이스케이프, 줄바꿈 포함 필드) */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** 헤더 별칭 (쿠팡 파트너스 리포트 내보내기 + 직접 작성 템플릿 모두 허용) */
const ALIASES: Record<string, string[]> = {
  date: ["date", "날짜", "일자", "기준일"],
  sub_id: ["sub_id", "subid", "채널아이디", "채널id", "trackingcode", "tracking_code", "추적코드"],
  product: ["product", "상품명", "product_name"],
  clicks: ["clicks", "클릭", "클릭수"],
  orders: ["orders", "주문", "주문수", "구매", "구매수", "전환", "전환수"],
  commission: ["commission", "수수료", "수익", "예상수익", "실적수수료", "revenue"],
};

const norm = (h: string) => h.toLowerCase().replace(/[\s()_\-[\]원]/g, "").replace("subid", "subid");

export interface MetricRow {
  line: number;
  date: string;
  sub_id: string | null;
  product: string | null;
  clicks: number | null;
  orders: number | null;
  commission: number | null;
}

function toInt(v: string | undefined): number | null {
  if (v === undefined) return null;
  const t = v.replace(/[,원\s]/g, "");
  if (t === "" || t === "-") return null; // 빈 칸은 0이 아니라 '데이터 없음'
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toDate(v: string): string | null {
  const m = v.trim().match(/^(\d{4})[-./]?(\d{1,2})[-./]?(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

export function parseMetricsCsv(text: string): { rows: MetricRow[]; errors: string[] } {
  const table = parseCsv(text);
  const errors: string[] = [];
  if (table.length < 2) return { rows: [], errors: ["데이터 행이 없습니다."] };
  const header = table[0].map(norm);
  const col: Record<string, number> = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    const idx = header.findIndex((h) => names.map(norm).includes(h));
    if (idx >= 0) col[key] = idx;
  }
  if (col.date === undefined) return { rows: [], errors: ["'date'(날짜) 열이 필요합니다."] };
  if (col.sub_id === undefined && col.product === undefined)
    errors.push("sub_id 또는 상품명 열이 없어 게시물/상품과 연결할 수 없습니다. 전체 합계로만 저장됩니다.");

  const rows: MetricRow[] = [];
  table.slice(1).forEach((r, i) => {
    const date = toDate(r[col.date] ?? "");
    if (!date) {
      errors.push(`${i + 2}행: 날짜 형식 오류 '${r[col.date] ?? ""}'`);
      return;
    }
    rows.push({
      line: i + 2,
      date,
      sub_id: col.sub_id !== undefined ? r[col.sub_id]?.trim() || null : null,
      product: col.product !== undefined ? r[col.product]?.trim() || null : null,
      clicks: col.clicks !== undefined ? toInt(r[col.clicks]) : null,
      orders: col.orders !== undefined ? toInt(r[col.orders]) : null,
      commission: col.commission !== undefined ? toInt(r[col.commission]) : null,
    });
  });
  return { rows, errors };
}

export const METRICS_CSV_TEMPLATE =
  "date,sub_id,product,clicks,orders,commission\n2026-11-01,cabc123def,접이식 실리콘 밀폐용기,40,2,1200\n";
