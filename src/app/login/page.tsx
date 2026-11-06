import Link from "next/link";
import { signIn, signUp } from "../actions";
import { Flash, flash, type SP } from "@/components/ui";
import { appMode } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: SP }) {
  const { msg, err } = await flash(searchParams);
  const mock = appMode() === "mock";
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="card w-full max-w-sm">
        <h1 className="text-lg font-bold">AI Commerce Autopilot</h1>
        <p className="muted mb-4">관리자 로그인</p>
        <Flash msg={msg} err={err} />
        {mock ? (
          <div className="space-y-3 text-sm">
            <p className="rounded-lg bg-violet-50 p-3 text-violet-800">
              모의 모드에서는 인증 없이 모의 사용자로 접속합니다. 실제 운영(live)에서는 Supabase 이메일 로그인이 필요합니다.
            </p>
            <Link href="/" className="btn-primary w-full">
              모의 사용자로 시작
            </Link>
          </div>
        ) : (
          <form className="space-y-3">
            <div>
              <label className="label" htmlFor="email">이메일</label>
              <input id="email" name="email" type="email" required className="input" autoComplete="email" />
            </div>
            <div>
              <label className="label" htmlFor="password">비밀번호</label>
              <input id="password" name="password" type="password" required minLength={8} className="input" autoComplete="current-password" />
            </div>
            <button formAction={signIn} className="btn-primary w-full">로그인</button>
            <button formAction={signUp} className="btn-secondary w-full">처음 사용 — 계정 만들기</button>
            <p className="text-xs text-slate-500">
              운영 시에는 Supabase 대시보드 → Authentication 에서 신규 가입을 막고(Disable signups), 관리자 계정만 사용하세요.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
