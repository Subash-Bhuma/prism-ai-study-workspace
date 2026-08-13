import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/server-auth";
import {
  ensureDemoWorkspace,
  listUserWorkspaces,
  toWorkspace,
} from "@/lib/workspace-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  await ensureDemoWorkspace(user.id, user.email);
  return NextResponse.json({
    ok: true,
    workspaces: await listUserWorkspaces(user.id),
  });
}

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 80) {
    return NextResponse.json(
      { ok: false, error: "Subject name must be between 1 and 80 characters." },
      { status: 400 }
    );
  }
  const row = await db.workspace.create({
    data: {
      userId: user.id,
      name,
      examDate: typeof body.examDate === "string" && body.examDate ? body.examDate : null,
      studyGoal: null,
    },
    include: { resources: true, concepts: true },
  });
  return NextResponse.json({ ok: true, workspace: toWorkspace(row) }, { status: 201 });
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const resources = await db.resource.findMany({
    where: { workspace: { userId: user.id } },
    select: { filePath: true },
  });
  await db.workspace.deleteMany({ where: { userId: user.id } });
  await Promise.all(
    resources.map((resource) =>
      resource.filePath ? fs.unlink(resource.filePath).catch(() => undefined) : undefined
    )
  );
  return NextResponse.json({ ok: true });
}
