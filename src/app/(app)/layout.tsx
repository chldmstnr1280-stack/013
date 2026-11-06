import Link from "next/link";
import { signOut } from "../actions";
import { Nav } from "@/components/nav";
import { getCtx } from "@/lib/ctx";
import { appMode } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCtx();
  const mode = appMode();
  const [drafts, unread] = await Promise.all([
    ctx.store.list("contents", { eq: { user_id: ctx.userId, status: "draft" } }),
    ctx.store.list("notifications", { eq: { user_id: ctx.userId, read: false } }),
  ]);
  return (
    <div className="min-h-screen lg:flex">
      <aside className="relative z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col lg:items-stretch lg:justify-start lg:border-b-0 lg:border-r lg:px-3 lg:py-5">
        <Link href="/" className="flex items-center gap-2 px-2 lg:mb-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">AP</span>
          <span className="text-sm font-bold leading-tight">
            AI Commerce
            <br className="hidden lg:block" /> Autopilot
          </span>
        </Link>
        <Nav badge={{ "/review": drafts.length, "/": unread.length }} />
        <div className="mt-auto hidden border-t border-slate-200 px-2 pt-3 text-xs text-slate-500 lg:block">
          <div className="truncate">{ctx.email ?? "사용자"}</div>
          <form action={signOut}>
            <button className="mt-1 text-brand-600 hover:underline">{mode === "mock" ? "모의 로그인 화면" : "로그아웃"}</button>
          </form>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        {mode === "mock" ? (
          <div className="mb-5 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-800">
            <strong>모의 모드</strong> — 외부 API(Claude·Threads·쿠팡)를 호출하지 않으며, 화면의 모든 데이터와 수치는 <strong>테스트용 모의 데이터</strong>입니다.
            실제 운영은 <code>APP_MODE=live</code> 로 실행하세요.
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
