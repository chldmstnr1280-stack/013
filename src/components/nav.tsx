"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export const NAV = [
  { href: "/", label: "대시보드" },
  { href: "/products", label: "상품 관리" },
  { href: "/generate", label: "AI 콘텐츠 생성" },
  { href: "/review", label: "콘텐츠 승인" },
  { href: "/calendar", label: "예약 캘린더" },
  { href: "/history", label: "발행 기록" },
  { href: "/analytics", label: "수익 분석" },
  { href: "/settings", label: "계정 및 API 설정" },
];

export function Nav({ badge }: { badge?: Record<string, number> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  const links = (
    <ul className="flex flex-col gap-1">
      {NAV.map((n) => (
        <li key={n.href}>
          <Link
            href={n.href}
            onClick={() => setOpen(false)}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${active(n.href) ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {n.label}
            {badge?.[n.href] ? <span className="rounded-full bg-brand-600 px-1.5 text-xs text-white">{badge[n.href]}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <button className="btn-secondary lg:hidden" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((o) => !o)}>
        {open ? "닫기" : "메뉴"}
      </button>
      {open && (
        <nav id="mobile-nav" className="absolute inset-x-0 top-full z-20 border-b border-slate-200 bg-white p-3 shadow-lg lg:hidden">
          {links}
        </nav>
      )}
      <nav className="hidden lg:block">{links}</nav>
    </>
  );
}
