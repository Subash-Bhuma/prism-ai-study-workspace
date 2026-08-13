import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { toResource } from "@/lib/mappers";
import { ownedWorkspace } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/workspaces/[wsId]/resources/[id] — remove file + record. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ wsId: string; id: string }> }
) {
  const { wsId, id } = await params;
  try {
    if (!(await ownedWorkspace(wsId))) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const row = await db.resource.findUnique({ where: { id } });
    if (!row || row.workspaceId !== wsId) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    if (row.filePath) {
      await fs.unlink(row.filePath).catch(() => {});
    }
    await db.resource.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/** PATCH — re-ingest (re-run extraction) an existing resource. */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ wsId: string; id: string }> }
) {
  const { wsId, id } = await params;
  try {
    if (!(await ownedWorkspace(wsId))) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const row = await db.resource.findUnique({ where: { id } });
    if (!row || row.workspaceId !== wsId || !row.filePath) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    await db.resource.update({ where: { id }, data: { status: "parsing", note: "Re-parsing…" } });
    const { extractFile } = await import("@/lib/extract");
    const result = await extractFile(row.filePath, row.name);
    const updated = await db.resource.update({
      where: { id },
      data: {
        status: result.status,
        note: result.note,
        pages: result.pages,
        extractedText: result.text,
      },
    });
    return NextResponse.json({ ok: true, resource: toResource(updated) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
