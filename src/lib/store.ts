"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  User,
  Workspace,
  View,
  WorkspaceTab,
  Resource,
  Concept,
  PracticeAttempt,
  TheoryQAPair,
  DiagnosticResult,
  DailyReport,
} from "./types";
import { DEMO_USER } from "./seed";

const uid = (p: string) =>
  `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

interface MiraState {
  user: User;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  view: View;
  tab: WorkspaceTab;
  activeProblemId: string | null;
  activeConceptId: string | null;
  hydrated: boolean;
  serverHydrated: boolean;

  // actions
  setHydrated: () => void;
  hydrateApp: () => Promise<void>;
  completeOnboarding: (data: Partial<User>) => void;
  setView: (v: View) => void;
  setTab: (t: WorkspaceTab) => void;
  openWorkspace: (id: string, tab?: WorkspaceTab) => void;
  createWorkspace: (name: string, examDate?: string | null) => Promise<string | null>;
  updateStudyGoal: (id: string, studyGoal: string) => Promise<boolean>;
  deleteWorkspace: (id: string) => Promise<void>;
  setActiveProblem: (id: string | null) => void;
  setActiveConcept: (id: string | null) => void;

  addResource: (wsId: string, r: Omit<Resource, "id" | "uploadedAt">) => void;
  updateResource: (wsId: string, resourceId: string, patch: Partial<Resource>) => void;
  removeResource: (wsId: string, resourceId: string) => void;

  setConcepts: (wsId: string, concepts: Concept[]) => void;
  updateConcept: (wsId: string, conceptId: string, patch: Partial<Concept>) => void;

  // Backend hydration — resources + concepts are the source of truth on the server.
  setResources: (wsId: string, resources: Resource[]) => void;
  upsertResource: (wsId: string, resource: Resource) => void;
  hydrateWorkspace: (wsId: string) => Promise<void>;

  addProblem: (wsId: string, problem: import("./types").PracticeProblem) => void;

  recordAttempt: (wsId: string, attempt: PracticeAttempt) => void;
  updateAttempt: (wsId: string, attemptId: string, patch: Partial<PracticeAttempt>) => void;

  addTheory: (wsId: string, t: TheoryQAPair) => void;
  updateTheory: (wsId: string, theoryId: string, patch: Partial<TheoryQAPair>) => void;

  setDiagnostic: (wsId: string, result: DiagnosticResult) => void;
  setReport: (wsId: string, report: DailyReport) => void;

  resetAll: () => Promise<void>;
}

const initialWorkspaces = (): Workspace[] => [];

export const useMira = create<MiraState>()(
  persist(
    (set, get) => ({
      user: DEMO_USER,
      workspaces: initialWorkspaces(),
      activeWorkspaceId: null,
      view: "onboarding",
      tab: "practice",
      activeProblemId: null,
      activeConceptId: null,
      hydrated: false,
      serverHydrated: false,

      setHydrated: () => set({ hydrated: true }),
      hydrateApp: async () => {
        try {
          const response = await fetch("/api/workspaces", { cache: "no-store" });
          const data = await response.json();
          if (!response.ok || !data.ok) throw new Error(data.error || "Could not load subjects");
          const workspaces = Array.isArray(data.workspaces) ? data.workspaces : [];
          const activeWorkspaceId = get().activeWorkspaceId;
          set({
            workspaces,
            activeWorkspaceId: workspaces.some((workspace: Workspace) => workspace.id === activeWorkspaceId)
              ? activeWorkspaceId
              : null,
            serverHydrated: true,
          });
        } catch {
          set({ workspaces: [], activeWorkspaceId: null, serverHydrated: true });
        }
      },

      completeOnboarding: (data) =>
        set((s) => ({
          user: { ...s.user, ...data, onboarded: true },
          view: "dashboard",
        })),

      setView: (v) => set({ view: v }),
      setTab: (t) => set({ tab: t }),

      openWorkspace: (id, tab) => {
        set({
          activeWorkspaceId: id,
          view: "workspace",
          tab: tab ?? get().tab,
        });
        // Hydrate resources + concepts from the backend (source of truth).
        void get().hydrateWorkspace(id);
      },

      createWorkspace: async (name, examDate) => {
        try {
          const response = await fetch("/api/workspaces", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, examDate: examDate ?? null }),
          });
          const data = await response.json();
          if (!response.ok || !data.ok) throw new Error(data.error || "Create failed");
          const workspace = data.workspace as Workspace;
          set((state) => ({ workspaces: [workspace, ...state.workspaces] }));
          return workspace.id;
        } catch {
          return null;
        }
      },

      updateStudyGoal: async (id, studyGoal) => {
        try {
          const response = await fetch(`/api/workspaces/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ studyGoal }),
          });
          const data = await response.json();
          if (!response.ok || !data.ok) throw new Error(data.error || "Update failed");
          set((state) => ({
            workspaces: state.workspaces.map((workspace) =>
              workspace.id === id ? { ...workspace, studyGoal: data.workspace.studyGoal } : workspace
            ),
          }));
          return true;
        } catch {
          return false;
        }
      },

      deleteWorkspace: async (id) => {
        const response = await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
        if (!response.ok) return;
        set((s) => ({
          workspaces: s.workspaces.filter((w) => w.id !== id),
          activeWorkspaceId:
            s.activeWorkspaceId === id ? null : s.activeWorkspaceId,
          view: s.activeWorkspaceId === id ? "dashboard" : s.view,
        }));
      },

      setActiveProblem: (id) => set({ activeProblemId: id }),
      setActiveConcept: (id) => set({ activeConceptId: id }),

      addResource: (wsId, r) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === wsId
              ? {
                  ...w,
                  resources: [
                    ...w.resources,
                    { ...r, id: uid("r"), uploadedAt: Date.now() },
                  ],
                }
              : w
          ),
        })),

      updateResource: (wsId, resourceId, patch) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === wsId
              ? {
                  ...w,
                  resources: w.resources.map((r) =>
                    r.id === resourceId ? { ...r, ...patch } : r
                  ),
                }
              : w
          ),
        })),

      removeResource: (wsId, resourceId) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === wsId
              ? { ...w, resources: w.resources.filter((r) => r.id !== resourceId) }
              : w
          ),
        })),

      setConcepts: (wsId, concepts) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === wsId ? { ...w, concepts } : w
          ),
        })),

      updateConcept: (wsId, conceptId, patch) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === wsId
              ? {
                  ...w,
                  concepts: w.concepts.map((c) =>
                    c.id === conceptId ? { ...c, ...patch } : c
                  ),
                }
              : w
          ),
        })),

      setResources: (wsId, resources) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === wsId
              ? {
                  ...w,
                  resources,
                  syllabusProgress:
                    resources.length > 0
                      ? resources.filter((r) => r.status === "parsed").length /
                        resources.length
                      : 0,
                }
              : w
          ),
        })),

      upsertResource: (wsId, resource) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) => {
            if (w.id !== wsId) return w;
            const exists = w.resources.some((r) => r.id === resource.id);
            const resources = exists
              ? w.resources.map((r) => (r.id === resource.id ? resource : r))
              : [...w.resources, resource];
            return {
              ...w,
              resources,
              syllabusProgress:
                resources.length > 0
                  ? resources.filter((r) => r.status === "parsed").length /
                    resources.length
                  : 0,
            };
          }),
        })),

      hydrateWorkspace: async (wsId) => {
        try {
          const [resRes, curRes] = await Promise.all([
            fetch(`/api/workspaces/${wsId}/resources`),
            fetch(`/api/workspaces/${wsId}/curriculum`),
          ]);
          const resData = await resRes.json();
          const curData = await curRes.json();
          if (resData.ok) get().setResources(wsId, resData.resources);
          if (curData.ok && Array.isArray(curData.concepts) && curData.concepts.length)
            get().setConcepts(wsId, curData.concepts);
        } catch {
          // silent — offline / not yet seeded; client data still works
        }
      },

      addProblem: (wsId, problem) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === wsId
              ? { ...w, problems: [...w.problems, problem] }
              : w
          ),
        })),

      recordAttempt: (wsId, attempt) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === wsId
              ? { ...w, attempts: [...w.attempts, attempt] }
              : w
          ),
        })),

      updateAttempt: (wsId, attemptId, patch) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === wsId
              ? {
                  ...w,
                  attempts: w.attempts.map((a) =>
                    a.id === attemptId ? { ...a, ...patch } : a
                  ),
                }
              : w
          ),
        })),

      addTheory: (wsId, t) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === wsId ? { ...w, theory: [...w.theory, t] } : w
          ),
        })),

      updateTheory: (wsId, theoryId, patch) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === wsId
              ? {
                  ...w,
                  theory: w.theory.map((t) =>
                    t.id === theoryId ? { ...t, ...patch } : t
                  ),
                }
              : w
          ),
        })),

      setDiagnostic: (wsId, result) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === wsId ? { ...w, diagnostic: result } : w
          ),
        })),

      setReport: (wsId, report) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === wsId ? { ...w, report } : w
          ),
        })),

      resetAll: async () => {
        const response = await fetch("/api/workspaces", { method: "DELETE" });
        if (!response.ok) return;
        set({
          workspaces: [],
          activeWorkspaceId: null,
          view: "dashboard",
          tab: "practice",
          activeProblemId: null,
          activeConceptId: null,
        });
      },
    }),
    {
      name: "mira-store-v1",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
      partialize: (s) => ({
        // NOTE: identity (user) is owned by NextAuth/the session, not the store.
        // Only persist client-side workspace/learning data here.
        activeWorkspaceId: s.activeWorkspaceId,
        view: s.view,
        tab: s.tab,
      }),
    }
  )
);

// Helper selector
export function useActiveWorkspace(): Workspace | null {
  return useMira((s) =>
    s.workspaces.find((w) => w.id === s.activeWorkspaceId) ?? null
  );
}

export { uid };

const syncTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleWorkspaceSync(workspaceId: string) {
  const existing = syncTimers.get(workspaceId);
  if (existing) clearTimeout(existing);
  syncTimers.set(
    workspaceId,
    setTimeout(async () => {
      syncTimers.delete(workspaceId);
      const workspace = useMira.getState().workspaces.find((item) => item.id === workspaceId);
      if (!workspace) return;
      await fetch(`/api/workspaces/${workspaceId}/state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problems: workspace.problems,
          attempts: workspace.attempts,
          theory: workspace.theory,
          diagnostic: workspace.diagnostic ?? null,
          report: workspace.report ?? null,
          conceptMetrics: workspace.concepts.map((concept) => ({
            id: concept.id,
            mastery: concept.mastery,
            status: concept.status,
            hintsUsed: concept.hintsUsed,
            fullReveals: concept.fullReveals,
            attempts: concept.attempts,
          })),
        }),
      }).catch(() => undefined);
    }, 650)
  );
}

useMira.subscribe((state, previous) => {
  if (!previous.serverHydrated || !state.serverHydrated) return;
  state.workspaces.forEach((workspace) => {
    const before = previous.workspaces.find((item) => item.id === workspace.id);
    if (!before) return;
    if (
      workspace.problems !== before.problems ||
      workspace.attempts !== before.attempts ||
      workspace.theory !== before.theory ||
      workspace.diagnostic !== before.diagnostic ||
      workspace.report !== before.report ||
      workspace.concepts !== before.concepts
    ) {
      scheduleWorkspaceSync(workspace.id);
    }
  });
});
