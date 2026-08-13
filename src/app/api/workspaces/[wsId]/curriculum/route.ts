import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toConcept } from "@/lib/mappers";
import { mapCurriculum, type IngestedFile } from "@/lib/ai";
import { ownedWorkspace } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/workspaces/[wsId]/curriculum — load saved concepts. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  if (!(await ownedWorkspace(wsId))) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  const rows = await db.concept.findMany({
    where: { workspaceId: wsId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ ok: true, concepts: rows.map(toConcept) });
}

/**
 * POST /api/workspaces/[wsId]/curriculum — read the REAL extracted text of every
 * resource in the workspace and have the LLM build the dependency graph from it.
 * Body: { subject: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  try {
    if (!(await ownedWorkspace(wsId))) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const body = await req.json().catch(() => ({}));
    const subject = body.subject ?? "this subject";

    const resources = await db.resource.findMany({
      where: { workspaceId: wsId },
      orderBy: { createdAt: "asc" },
    });
    if (resources.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Upload at least one source before mapping the curriculum." },
        { status: 400 }
      );
    }

    const files: IngestedFile[] = resources.map((r) => ({
      name: r.name,
      kind: r.kind,
      note: r.note ?? undefined,
      text: r.extractedText ?? "",
    }));

    const concepts = await mapCurriculum({ subject, files });

    // Persist: replace the workspace's concepts with the freshly-mapped set.
    await db.$transaction([
      db.concept.deleteMany({ where: { workspaceId: wsId } }),
      ...concepts.map((c) =>
        db.concept.create({
          data: {
          id: c.id,
          workspaceId: wsId,
          title: c.title,
          description: c.description,
          unit: c.unit,
          examWeight: c.examWeight,
          mastery: c.mastery,
          status: c.status,
          dependencies: JSON.stringify(c.dependencies),
          hintsUsed: c.hintsUsed,
          fullReveals: c.fullReveals,
          attempts: c.attempts,
          },
        })
      ),
    ]);

    return NextResponse.json({ ok: true, concepts });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
