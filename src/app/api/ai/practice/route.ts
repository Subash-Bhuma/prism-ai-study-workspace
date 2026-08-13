import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generatePractice, buildMaterialContext } from "@/lib/ai";
import { currentUser, ownedWorkspace } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    // Ground the generated problem in the student's OWN uploaded material.
    let context = body.context as string | undefined;
    if (body.workspaceId && !context) {
      if (!(await ownedWorkspace(body.workspaceId))) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }
      const rows = await db.resource.findMany({
        where: { workspaceId: body.workspaceId, status: "parsed" },
        select: { name: true, kind: true, extractedText: true },
      });
      const files = rows.map((r) => ({
        name: r.name,
        kind: r.kind,
        text: r.extractedText ?? "",
      }));
      context = buildMaterialContext(files);
    }
    const problem = await generatePractice({
      concept: body.concept,
      difficulty: body.difficulty,
      context,
    });
    return NextResponse.json({ ok: true, problem });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
