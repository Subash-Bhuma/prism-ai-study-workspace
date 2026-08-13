import { NextRequest, NextResponse } from "next/server";
import { getHint, getFullSolution } from "@/lib/ai";
import { currentUser } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    if (body.level === 4) {
      const solution = await getFullSolution(body);
      return NextResponse.json({ ok: true, hint: solution, level: 4 });
    }
    const hint = await getHint(body);
    return NextResponse.json({ ok: true, hint, level: body.level });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
