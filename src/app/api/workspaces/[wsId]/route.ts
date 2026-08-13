import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
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
  const data: { name?: string; examDate?: string | null } = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name || name.length > 80) {
      return NextResponse.json({ ok: false, error: "Invalid subject name." }, { status: 400 });
    }
    data.name = name;
  }
  if (body.examDate === null || typeof body.examDate === "string") {
    data.examDate = body.examDate || null;
  }
  const updated = await db.workspace.update({ where: { id: wsId }, data });
  return NextResponse.json({ ok: true, workspace: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const workspace = await ownedWorkspace(wsId);
  if (!workspace) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  const resources = await db.resource.findMany({
    where: { workspaceId: wsId },
    select: { filePath: true },
  });
  await db.workspace.delete({ where: { id: wsId } });
  await Promise.all(
    resources.map((resource) =>
      resource.filePath ? fs.unlink(resource.filePath).catch(() => undefined) : undefined
    )
  );
  return NextResponse.json({ ok: true });
}
