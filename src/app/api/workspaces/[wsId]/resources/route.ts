import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { toResource } from "@/lib/mappers";
import { extractFile, inferKind } from "@/lib/extract";
import { seedDemoResourcesIfEmpty, DEMO_WORKSPACE_ID } from "@/lib/demo-seed";
import { ownedWorkspace } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".txt", ".md", ".markdown", ".csv", ".json", ".tex",
  ".png", ".jpg", ".jpeg", ".webp", ".bmp",
]);

/** GET /api/workspaces/[wsId]/resources — list, auto-seeding the demo workspace. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  if (!(await ownedWorkspace(wsId))) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (wsId === DEMO_WORKSPACE_ID) {
    await seedDemoResourcesIfEmpty(wsId);
  }
  const rows = await db.resource.findMany({
    where: { workspaceId: wsId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ ok: true, resources: rows.map(toResource) });
}

/** POST /api/workspaces/[wsId]/resources — multipart upload → save → extract → persist. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  try {
    if (!(await ownedWorkspace(wsId))) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const fd = await req.formData();
    const file = fd.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "No file provided (field name must be 'file')." },
        { status: 400 }
      );
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { ok: false, error: "Files must be between 1 byte and 25 MB." },
        { status: 413 }
      );
    }
    const extension = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        { ok: false, error: "Use PDF, text, Markdown, CSV, JSON, LaTeX, or an image." },
        { status: 415 }
      );
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
    const filePath = path.join(UPLOAD_DIR, storedName);
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buf);

    // Create the record in "parsing" first so the client can show it immediately.
    const kind = inferKind(file.name);
    const sizeKb = Math.max(1, Math.round(file.size / 1024));
    const created = await db.resource.create({
      data: {
        workspaceId: wsId,
        name: file.name,
        kind,
        status: "parsing",
        sizeKb,
        filePath,
      },
    });

    // Real extraction (PDF / text / image-OCR). This may take a few seconds
    // for images (vision model). We await so the response carries the final
    // status — the client shows "Prism is reading this file…" meanwhile.
    const result = await extractFile(filePath, file.name);
    const updated = await db.resource.update({
      where: { id: created.id },
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
