import { NextResponse } from "next/server";
import { AI_CONFIGURED, AI_MODEL } from "@/lib/ai";
import { db } from "@/lib/db";

export async function GET() {
  try {
    await db.user.count();
    return NextResponse.json({
      ok: true,
      service: "prism-api",
      database: "ready",
      ai: { model: AI_MODEL, mode: AI_CONFIGURED ? "live" : "demo" },
    });
  } catch {
    return NextResponse.json(
      { ok: false, service: "prism-api", database: "unavailable" },
      { status: 503 }
    );
  }
}
