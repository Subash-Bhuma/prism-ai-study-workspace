import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toConcept, toResource } from "@/lib/mappers";
import { DEMO_WORKSPACE } from "@/lib/seed";
import { seedDemoResourcesIfEmpty } from "@/lib/demo-seed";

type WorkspaceWithData = Prisma.WorkspaceGetPayload<{
  include: { resources: true; concepts: true };
}>;

function parseState(raw: string) {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function toWorkspace(row: WorkspaceWithData) {
  const state = parseState(row.learningState) as Record<string, unknown>;
  const resources = row.resources.map(toResource);
  return {
    id: row.id,
    name: row.name,
    examDate: row.examDate,
    color: row.color,
    createdAt: row.createdAt.getTime(),
    resources,
    concepts: row.concepts.map(toConcept),
    problems: Array.isArray(state.problems) ? state.problems : [],
    attempts: Array.isArray(state.attempts) ? state.attempts : [],
    theory: Array.isArray(state.theory) ? state.theory : [],
    diagnostic: state.diagnostic,
    report: state.report,
    syllabusProgress:
      resources.length === 0
        ? 0
        : resources.filter((resource) => resource.status === "parsed").length /
          resources.length,
  };
}

export async function listUserWorkspaces(userId: string) {
  const rows = await db.workspace.findMany({
    where: { userId },
    include: {
      resources: { orderBy: { createdAt: "desc" } },
      concepts: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toWorkspace);
}

export async function ensureDemoWorkspace(userId: string, email: string) {
  if (email !== "demo@prism.study") return;
  const existing = await db.workspace.findFirst({ where: { userId } });
  if (existing) return;

  await db.workspace.create({
    data: {
      id: DEMO_WORKSPACE.id,
      userId,
      name: DEMO_WORKSPACE.name,
      examDate: DEMO_WORKSPACE.examDate,
      color: DEMO_WORKSPACE.color,
      learningState: JSON.stringify({
        problems: DEMO_WORKSPACE.problems,
        attempts: DEMO_WORKSPACE.attempts,
        theory: DEMO_WORKSPACE.theory,
        diagnostic: DEMO_WORKSPACE.diagnostic,
        report: DEMO_WORKSPACE.report,
      }),
    },
  });

  await seedDemoResourcesIfEmpty(DEMO_WORKSPACE.id);
  await db.concept.createMany({
    data: DEMO_WORKSPACE.concepts.map((concept) => ({
      id: concept.id,
      workspaceId: DEMO_WORKSPACE.id,
      title: concept.title,
      description: concept.description,
      unit: concept.unit,
      examWeight: concept.examWeight,
      mastery: concept.mastery,
      status: concept.status,
      dependencies: JSON.stringify(concept.dependencies),
      hintsUsed: concept.hintsUsed,
      fullReveals: concept.fullReveals,
      attempts: concept.attempts,
    })),
  });
}
