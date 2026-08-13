import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateTheory, buildMaterialContext } from "@/lib/ai";
import { currentUser, ownedWorkspace } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    // Ground the model answer in the student's OWN uploaded material so it
    // matches their professor's phrasing and emphasis.
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
    const result = await generateTheory({ question: body.question, context });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
