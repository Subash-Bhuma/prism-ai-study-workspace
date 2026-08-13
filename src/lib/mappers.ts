import type { Resource, Concept } from "./types";

/** Prisma Resource row → client Resource shape. */
export function toResource(r: {
  id: string;
  workspaceId: string;
  name: string;
  kind: string;
  status: string;
  pages: number | null;
  note: string | null;
  sizeKb: number | null;
  filePath: string | null;
  extractedText: string | null;
  createdAt: Date;
}): Resource {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind as Resource["kind"],
    status: r.status as Resource["status"],
    pages: r.pages ?? undefined,
    note: r.note ?? undefined,
    sizeKb: r.sizeKb ?? undefined,
    uploadedAt: r.createdAt.getTime(),
  };
}

/** Prisma Concept row → client Concept shape. */
export function toConcept(c: {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  unit: string;
  examWeight: number;
  mastery: number;
  status: string;
  dependencies: string;
  hintsUsed: number;
  fullReveals: number;
  attempts: number;
}): Concept {
  let dependencies: string[] = [];
  try {
    dependencies = JSON.parse(c.dependencies);
  } catch {
    dependencies = [];
  }
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    unit: c.unit,
    examWeight: c.examWeight,
    mastery: c.mastery,
    status: c.status as Concept["status"],
    dependencies,
    hintsUsed: c.hintsUsed,
    fullReveals: c.fullReveals,
    attempts: c.attempts,
  };
}
