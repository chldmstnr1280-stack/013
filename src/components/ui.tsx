import Link from "next/link";
import type { ReactNode } from "react";
import type { ContentStatus, DataSource, JobStatus } from "@/lib/types";

export function PageHeader({ title, desc, actions }: { title: string; desc?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
        {desc && <p className="mt-1 text-sm text-slate-500">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (!msg && !err) return null;
  return (
    <div
      role={err ? "alert" : "status"}
      className={`mb-4 rounded-lg border px-4 py-3 text-sm ${err ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
    >
      {err ?? msg}
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "amber" | "red" | "blue" | "violet" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700",
    blue: "bg-brand-100 text-brand-700",
    violet: "bg-violet-100 text-violet-800",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

/** 모의 데이터 표시 — 실제 운영 데이터와 구분 */
export function MockBadge({ show = true }: { show?: boolean }) {
  return show ? <Badge tone="violet">모의</Badge> : null;
}

const CONTENT_STATUS: Record<ContentStatus, [string, "slate" | "green" | "amber" | "red" | "blue"]> = {
  draft: ["초안", "slate"],
  approved: ["승인", "blue"],
  rejected: ["반려", "red"],
  scheduled: ["예약됨", "amber"],
  published: ["발행됨", "green"],
  failed: ["실패", "red"],
};
export const ContentStatusBadge = ({ s }: { s: ContentStatus }) => <Badge tone={CONTENT_STATUS[s][1]}>{CONTENT_STATUS[s][0]}</Badge>;

const JOB_STATUS: Record<JobStatus, [string, "slate" | "green" | "amber" | "red" | "blue"]> = {
  pending: ["대기", "amber"],
  processing: ["처리 중", "blue"],
  published: ["발행 완료", "green"],
  failed: ["실패", "red"],
  cancelled: ["취소", "slate"],
};
export const JobStatusBadge = ({ s }: { s: JobStatus }) => <Badge tone={JOB_STATUS[s][1]}>{JOB_STATUS[s][0]}</Badge>;

const SOURCE_LABEL: Record<DataSource, string> = {
  threads_api: "Threads API",
  csv: "CSV 업로드",
  manual: "수동 입력",
  tracker: "자체 추적",
  mock: "모의 데이터",
};
export const SourceBadges = ({ sources }: { sources: DataSource[] }) =>
  sources.length ? (
    <span className="inline-flex flex-wrap gap-1">
      {sources.map((s) => (
        <Badge key={s} tone={s === "mock" ? "violet" : "slate"}>
          {SOURCE_LABEL[s]}
        </Badge>
      ))}
    </span>
  ) : (
    <span className="text-xs text-slate-400">데이터 없음</span>
  );

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Empty({ children, href, cta }: { children: ReactNode; href?: string; cta?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
      <p>{children}</p>
      {href && cta && (
        <Link href={href} className="btn-primary mt-3">
          {cta}
        </Link>
      )}
    </div>
  );
}

export const fmtDateTime = (iso: string | null | undefined, tz = "Asia/Seoul") =>
  iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: tz, month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export type SP = Promise<Record<string, string | string[] | undefined>>;
export async function flash(sp: SP) {
  const p = await sp;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return { msg: one(p.msg), err: one(p.err), params: p };
}
