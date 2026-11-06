import type { CheckResult } from "@/lib/types";

const ICON = { pass: "✓", warn: "!", fail: "✕" } as const;
const TONE = {
  pass: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  fail: "border-red-200 bg-red-50 text-red-700",
} as const;

export function CheckSummary({ checks }: { checks?: CheckResult[] }) {
  if (!checks?.length) return <span className="text-xs text-slate-400">검사 전</span>;
  const f = checks.filter((c) => c.level === "fail").length;
  const w = checks.filter((c) => c.level === "warn").length;
  return (
    <span className="text-xs">
      {f > 0 && <span className="mr-2 text-red-600">수정 필요 {f}</span>}
      {w > 0 && <span className="mr-2 text-amber-700">확인 {w}</span>}
      {f === 0 && w === 0 && <span className="text-emerald-700">자동 검사 통과</span>}
    </span>
  );
}

export function CheckItem({ c }: { c: CheckResult }) {
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${TONE[c.level]}`}>
      <div className="font-medium">
        <span aria-hidden className="mr-1">{ICON[c.level]}</span>
        {c.label}
        <span className="sr-only"> — {c.level === "pass" ? "통과" : c.level === "warn" ? "확인 필요" : "수정 필요"}</span>
      </div>
      <ul className="mt-1 list-disc pl-5 text-xs">
        {c.messages.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
    </div>
  );
}
