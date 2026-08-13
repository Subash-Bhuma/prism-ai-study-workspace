import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return db.user.findUnique({ where: { email: session.user.email } });
}

/** GET /api/profile — current user's profile. */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    ok: true,
    profile: {
      id: user.id,
      email: user.email,
      name: user.name,
      course: user.course,
      semester: user.semester,
      examDate: user.examDate,
      onboarded: user.onboarded,
      avatarSeed: user.avatarSeed,
      createdAt: user.createdAt,
    },
  });
}

/** PATCH /api/profile — update profile fields + mark onboarded. */
export async function PATCH(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string") data.name = body.name.trim() || null;
    if (typeof body.course === "string") data.course = body.course.trim() || null;
    if (typeof body.semester === "string") data.semester = body.semester.trim() || null;
    if (body.examDate !== undefined) data.examDate = body.examDate || null;
    if (typeof body.avatarSeed === "string") data.avatarSeed = body.avatarSeed.trim() || "prism";
    if (typeof body.onboarded === "boolean") data.onboarded = body.onboarded;

    const updated = await db.user.update({
      where: { id: user.id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        course: true,
        semester: true,
        examDate: true,
        onboarded: true,
        avatarSeed: true,
      },
    });
    return NextResponse.json({ ok: true, profile: updated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
