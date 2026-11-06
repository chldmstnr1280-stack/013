import { METRICS_CSV_TEMPLATE } from "@/lib/csv";

export function GET() {
  return new Response("﻿" + METRICS_CSV_TEMPLATE, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="affiliate-metrics-template.csv"',
    },
  });
}
