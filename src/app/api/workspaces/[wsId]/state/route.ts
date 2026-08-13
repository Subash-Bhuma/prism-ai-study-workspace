import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ownedWorkspace } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const workspace = await ownedWorkspace(wsId);
  if (!workspace) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const state = {
    problems: Array.isArray(body.problems) ? body.problems : [],
    attempts: Array.isArray(body.attempts) ? body.attempts : [],
    theory: Array.isArray(body.theory) ? body.theory : [],
    diagnostic: body.diagnostic ?? null,
    report: body.report ?? null,
  };
  const encoded = JSON.stringify(state);
  if (encoded.length > 2_000_000) {
    return NextResponse.json({ ok: false, error: "Workspace history is too large." }, { status: 413 });
  }

  await db.workspace.update({
    where: { id: wsId },
    data: { learningState: encoded },
  });

  if (Array.isArray(body.conceptMetrics)) {
    const updates = body.conceptMetrics
      .filter((item: unknown) => item && typeof item === "object")
      .map((item: Record<string, unknown>) =>
        db.concept.updateMany({
          where: { id: String(item.id), workspaceId: wsId },
          data: {
            mastery: Number(item.mastery) || 0,
            status: typeof item.status === "string" ? item.status : "available",
            hintsUsed: Math.max(0, Number(item.hintsUsed) || 0),
            fullReveals: Math.max(0, Number(item.fullReveals) || 0),
            attempts: Math.max(0, Number(item.attempts) || 0),
          },
        })
      );
    if (updates.length) await db.$transaction(updates);
  }

  return NextResponse.json({ ok: true });
}
