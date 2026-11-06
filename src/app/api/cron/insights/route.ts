import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { logApi } from "@/lib/log";
import { refreshInsights } from "@/lib/publisher";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, result: await refreshInsights() });
  } catch (e) {
    await logApi(null, "system", "cron_insights", false, (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
