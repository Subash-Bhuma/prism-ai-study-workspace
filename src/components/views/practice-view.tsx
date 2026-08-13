"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import katex from "katex";
import {
  Check,
  HelpCircle,
  ThumbsUp,
  Target,
  LifeBuoy,
  Lightbulb,
  Loader2,
  Sparkles,
  ChevronRight,
  Wand2,
  PartyPopper,
  ArrowRight,
  CircleAlert,
  MessageCircleQuestion,
  ListTree,
  Footprints,
  BookOpen,
  Send,
  CheckCircle2,
  RotateCcw,
  Flame,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tex, Markdown } from "@/components/math";
import { MathInput } from "@/components/math-input";
import { useMira, useActiveWorkspace, uid } from "@/lib/store";
import type {
  AttemptStep,
  Confidence,
  ErrorType,
  PracticeProblem,
  Concept,
  PracticeAttempt,
  Workspace,
} from "@/lib/types";
import { cn } from "@/lib/utils";

// ── constants ──────────────────────────────────────────────────────────────

const CONFIDENCE_OPTIONS: {
  value: Confidence;
  label: string;
  icon: React.ReactNode;
  on: string;
  badge: string;
}[] = [
  {
    value: "guessed",
    label: "Guessed",
    icon: <HelpCircle className="size-3.5" />,
    on: "bg-muted text-foreground border-border",
    badge: "bg-muted/60 text-muted-foreground border-transparent",
  },
  {
    value: "fairly-sure",
    label: "Fairly sure",
    icon: <ThumbsUp className="size-3.5" />,
    on: "bg-warning/15 text-warning-foreground border-warning/40",
    badge: "bg-warning/15 text-warning-foreground border-warning/30",
  },
  {
    value: "certain",
    label: "Certain",
    icon: <Target className="size-3.5" />,
    on: "bg-primary/15 text-primary border-primary/40",
    badge: "bg-primary/15 text-primary border-primary/30",
  },
];

const ERROR_LABELS: Record<ErrorType, string> = {
  "sign-error": "Sign error",
  "wrong-formula": "Wrong formula",
  "conceptual-gap": "Conceptual gap",
  "arithmetic-slip": "Arithmetic slip",
  none: "",
};

const DIFFICULTY_LABELS: Record<number, string> = {
  1: "Warm-up",
  2: "Standard",
  3: "Exam-level",
  4: "Hard exam",
  5: "Challenge",
};

const HINT_RUNGS: {
  level: 1 | 2 | 3 | 4;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    level: 1,
    label: "Ask me a question",
    description: "A nudge to think, nothing given away",
    icon: <MessageCircleQuestion className="size-4" />,
  },
  {
    level: 2,
    label: "Name the concept",
    description: "Which technique to reach for",
    icon: <ListTree className="size-4" />,
  },
  {
    level: 3,
    label: "Show a partial step",
    description: "One worked move to get unstuck",
    icon: <Footprints className="size-4" />,
  },
  {
    level: 4,
    label: "Reveal full solution",
    description: "The whole worked answer",
    icon: <BookOpen className="size-4" />,
  },
];

// ── helpers ────────────────────────────────────────────────────────────────

function depsSatisfied(c: Concept, all: Concept[]): boolean {
  return c.dependencies.every((d) => {
    const dep = all.find((x) => x.id === d);
    return dep && dep.status === "mastered";
  });
}

/**
 * Pick the problem to surface on first load.
 * 1. Resume any unsolved attempt that already has steps (the demo's Bernoulli attempt).
 * 2. Otherwise prefer in-progress concepts, then lowest-mastery available concepts
 *    whose dependencies are satisfied, and pick their first problem.
 * 3. If no concept has a problem, return the top-ranked concept so the UI can
 *    show a "Generate a problem" CTA.
 */
function pickInitialProblem(
  ws: Workspace | null
): { problem: PracticeProblem | null; concept: Concept } | null {
  if (!ws) return null;

  // 1. resume unsolved work
  const unsolvedWithSteps = ws.attempts
    .filter((a) => !a.solved && a.steps.length > 0)
    .sort((a, b) => b.startedAt - a.startedAt);
  for (const att of unsolvedWithSteps) {
    const p = ws.problems.find((p) => p.id === att.problemId);
    if (p) {
      const c = ws.concepts.find((c) => c.id === p.conceptId);
      if (c) return { problem: p, concept: c };
    }
  }

  // 2. in-progress first, then available (deps satisfied), lowest mastery
  const eligible = ws.concepts.filter(
    (c) => c.status === "in-progress" || c.status === "available"
  );
  const sorted = [...eligible].sort((a, b) => {
    const aReady = a.status === "in-progress" || depsSatisfied(a, ws.concepts);
    const bReady = b.status === "in-progress" || depsSatisfied(b, ws.concepts);
    if (aReady !== bReady) return aReady ? -1 : 1;
    if (a.status === "in-progress" && b.status !== "in-progress") return -1;
    if (b.status === "in-progress" && a.status !== "in-progress") return 1;
    return a.mastery - b.mastery;
  });
  for (const c of sorted) {
    const p = ws.problems.find((p) => p.conceptId === c.id);
    if (p) return { problem: p, concept: c };
  }
  if (sorted.length) return { problem: null, concept: sorted[0] };
  return null;
}

/** Pick the next problem after solving — skip the current concept, lowest mastery first. */
function pickNextProblem(
  ws: Workspace | null,
  currentConceptId: string
): { problem: PracticeProblem; concept: Concept } | null {
  if (!ws) return null;
  const eligible = ws.concepts.filter(
    (c) =>
      c.id !== currentConceptId &&
      (c.status === "in-progress" || c.status === "available")
  );
  const sorted = [...eligible].sort((a, b) => a.mastery - b.mastery);
  for (const c of sorted) {
    const p = ws.problems.find((p) => p.conceptId === c.id);
    if (p) return { problem: p, concept: c };
  }
  return null;
}

/** Pick the next concept (even if it has no problem yet) for auto-progression. */
function pickNextConcept(
  ws: Workspace | null,
  currentConceptId: string
): Concept | null {
  if (!ws) return null;
  const eligible = ws.concepts.filter(
    (c) =>
      c.id !== currentConceptId &&
      (c.status === "in-progress" || c.status === "available")
  );
  const sorted = [...eligible].sort((a, b) => a.mastery - b.mastery);
  return sorted[0] ?? null;
}

/** Render LaTeX if it parses cleanly; otherwise fall back to plain text. */
function SmartTex({
  children,
  className,
  display = false,
}: {
  children: string;
  className?: string;
  display?: boolean;
}) {
  const isMath = useMemo(() => {
    if (!children.trim()) return false;
    try {
      katex.renderToString(children, {
        displayMode: display,
        throwOnError: true,
        strict: false,
      });
      return true;
    } catch {
      return false;
    }
  }, [children, display]);
  if (!isMath) return <span className={className}>{children}</span>;
  return (
    <Tex display={display} className={className}>
      {children}
    </Tex>
  );
}

// ── main view ──────────────────────────────────────────────────────────────

export function PracticeView() {
  const ws = useActiveWorkspace();
  const {
    activeProblemId,
    activeConceptId,
    setActiveProblem,
    setActiveConcept,
    addProblem,
    recordAttempt,
    updateAttempt,
    updateConcept,
    hydrated,
  } = useMira();

  // local UI state
  const [confidence, setConfidence] = useState<Confidence>("fairly-sure");
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingStepId, setCheckingStepId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [stuckOpen, setStuckOpen] = useState(false);
  const [hintLoading, setHintLoading] = useState<Record<number, boolean>>({});
  const [hintResults, setHintResults] = useState<Record<number, string>>({});
  const [hintsUsedLocal, setHintsUsedLocal] = useState(0);
  const [fullRevealsLocal, setFullRevealsLocal] = useState(0);
  const [betterLoading, setBetterLoading] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [idle, setIdle] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProblemId = useRef<string | null>(null);

  // ── pick / sync active problem on first load ──────────────────────────
  useEffect(() => {
    if (!hydrated || !ws) return;
    if (activeProblemId) return;
    const pick = pickInitialProblem(ws);
    if (!pick) return;
    if (pick.problem) {
      setActiveConcept(pick.concept.id);
      setActiveProblem(pick.problem.id);
    } else if (!activeConceptId) {
      setActiveConcept(pick.concept.id);
    }
  }, [hydrated, ws, activeProblemId, activeConceptId, setActiveProblem, setActiveConcept]);

  // derive active problem & concept
  const problem = useMemo<PracticeProblem | null>(() => {
    if (!ws) return null;
    if (activeProblemId) {
      return ws.problems.find((p) => p.id === activeProblemId) ?? null;
    }
    return null;
  }, [ws, activeProblemId]);

  const concept = useMemo<Concept | null>(() => {
    if (!ws) return null;
    const cid = problem?.conceptId ?? activeConceptId;
    return ws.concepts.find((c) => c.id === cid) ?? null;
  }, [ws, problem, activeConceptId]);

  // ── sync local attempt id + reset transient state on problem switch ──
  useEffect(() => {
    const pid = problem?.id ?? null;
    if (pid === lastProblemId.current) return;
    lastProblemId.current = pid;
    setHintResults({});
    setHintsUsedLocal(0);
    setFullRevealsLocal(0);
    setStuckOpen(false);
    setCelebrating(false);
    setInput("");
    setCheckingStepId(null);
    if (!ws || !problem) {
      setAttemptId(null);
      return;
    }
    const existing = ws.attempts
      .filter((a) => a.problemId === problem.id && !a.solved)
      .sort((a, b) => b.startedAt - a.startedAt)[0];
    setAttemptId(existing?.id ?? null);
  }, [problem, ws]);

  const attempt = useMemo<PracticeAttempt | null>(() => {
    if (!ws || !attemptId) return null;
    return ws.attempts.find((a) => a.id === attemptId) ?? null;
  }, [ws, attemptId]);

  const steps: AttemptStep[] = attempt?.steps ?? [];
  const solved = attempt?.solved ?? false;
  const lastStep = steps[steps.length - 1];
  const lastStepWrong =
    !!lastStep && !lastStep.correct && lastStep.checkedAt != null;

  // ── idle tracking for the stuck-bubble pulse ──────────────────────────
  const resetIdle = () => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 9000);
  };
  useEffect(() => {
    resetIdle();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [problem?.id, steps.length]);

  const pulseStuck =
    (idle || lastStepWrong) && !stuckOpen && !solved && steps.length > 0;

  // ── step submission ──────────────────────────────────────────────────
  const ensureAttempt = (): string => {
    if (!ws || !problem || !concept) throw new Error("no active problem");
    if (attemptId) return attemptId;
    const id = uid("att");
    const att: PracticeAttempt = {
      id,
      problemId: problem.id,
      conceptId: concept.id,
      steps: [],
      startedAt: Date.now(),
      solved: false,
    };
    recordAttempt(ws.id, att);
    setAttemptId(id);
    return id;
  };

  const handleSubmitStep = async () => {
    if (!ws || !problem || !concept) return;
    const text = input.trim();
    if (!text || submitting) return;

    const attId = ensureAttempt();
    const stepId = uid("s");
    const newStep: AttemptStep = {
      id: stepId,
      latex: text,
      text,
      confidence,
      correct: false,
      feedback: undefined,
      errorType: undefined,
      checkedAt: undefined,
    };
    const priorSteps = steps.map((s) => ({ text: s.text }));
    const newSteps = [...steps, newStep];
    updateAttempt(ws.id, attId, { steps: newSteps });
    setInput("");
    setSubmitting(true);
    setCheckingStepId(stepId);
    resetIdle();

    try {
      const res = await fetch("/api/ai/check-step", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          problem: { prompt: problem.prompt, latex: problem.latex, solutionPaths: problem.solutionPaths },
          priorSteps,
          currentStep: { text, latex: text },
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "check failed");

      const correct: boolean = !!data.correct;
      const errorType: ErrorType = (data.errorType ?? "none") as ErrorType;
      const feedback: string = correct ? "" : (data.feedback ?? "");
      const looksComplete: boolean = !!data.looksComplete;

      // re-read fresh steps from the store (closure may be stale across the await)
      const latestAttempt = useMira
        .getState()
        .workspaces.find((w) => w.id === ws.id)
        ?.attempts.find((a) => a.id === attId);
      const latestSteps = latestAttempt?.steps ?? newSteps;
      const updated = latestSteps.map((s) =>
        s.id === stepId
          ? {
              ...s,
              correct,
              errorType,
              feedback: correct ? undefined : feedback,
              checkedAt: Date.now(),
            }
          : s
      );
      updateAttempt(ws.id, attId, { steps: updated });
      setCheckingStepId(null);

      if (correct && looksComplete) {
        // hero moment — silent check, then gently offer the better-method comparison
        await runBetterMethod(attId, updated);
      }
      // wrong: the step card already shows the rose tint + feedback. Stay calm, no toast.
    } catch {
      const latestAttempt = useMira
        .getState()
        .workspaces.find((w) => w.id === ws.id)
        ?.attempts.find((a) => a.id === attId);
      const latestSteps = latestAttempt?.steps ?? steps;
      const updated = latestSteps.map((s) =>
        s.id === stepId
          ? {
              ...s,
              correct: false,
              errorType: "none" as ErrorType,
              feedback:
                "Prism couldn't verify this step — proceed if you're confident, or rewrite it.",
              checkedAt: Date.now(),
            }
          : s
      );
      updateAttempt(ws.id, attId, { steps: updated });
      setCheckingStepId(null);
      toast.error("Couldn't reach Prism — step left unchecked.");
    } finally {
      setSubmitting(false);
    }
  };

  const runBetterMethod = async (
    attId: string,
    currentSteps: AttemptStep[]
  ) => {
    if (!ws || !problem || !concept) return;
    setBetterLoading(true);
    try {
      const res = await fetch("/api/ai/better-method", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          problem: { prompt: problem.prompt, latex: problem.latex, solutionPaths: problem.solutionPaths },
          studentSteps: currentSteps.map((s) => ({ text: s.text })),
          solutionPaths: problem.solutionPaths,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "better-method failed");
      const text: string = data.text ?? "";
      updateAttempt(ws.id, attId, {
        solved: true,
        completedAt: Date.now(),
        betterMethod: text,
      });
      const newMastery = Math.min(1, concept.mastery + 0.1);
      const mastered = newMastery >= 0.8;
      updateConcept(ws.id, concept.id, {
        mastery: newMastery,
        attempts: concept.attempts + 1,
        status: mastered ? "mastered" : concept.status,
        hintsUsed: concept.hintsUsed + hintsUsedLocal,
        fullReveals: concept.fullReveals + fullRevealsLocal,
      });
      setCelebrating(true);
    } catch {
      toast.error("Couldn't fetch the better-method comparison.");
    } finally {
      setBetterLoading(false);
    }
  };

  const handleImDone = async () => {
    if (!ws || !problem || !concept || !attemptId || steps.length === 0) return;
    await runBetterMethod(attemptId, steps);
  };

  const handleHint = async (level: 1 | 2 | 3 | 4) => {
    if (!ws || !problem) return;
    setHintLoading((s) => ({ ...s, [level]: true }));
    try {
      const res = await fetch("/api/ai/hint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          problem: { prompt: problem.prompt, latex: problem.latex },
          priorSteps: steps.map((s) => ({ text: s.text })),
          level,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "hint failed");
      const hint: string = data.hint ?? "";
      setHintResults((s) => ({ ...s, [level]: hint }));
      if (level === 4) setFullRevealsLocal((n) => n + 1);
      else setHintsUsedLocal((n) => n + 1);
      resetIdle();
    } catch {
      toast.error("Couldn't fetch that hint.");
    } finally {
      setHintLoading((s) => ({ ...s, [level]: false }));
    }
  };

  const handleGenerate = async (targetConcept?: Concept) => {
    if (!ws) return;
    const c = targetConcept ?? concept;
    if (!c) return;
    setGenerating(true);
    try {
      const diff = (problem?.difficulty ?? 3) as 1 | 2 | 3 | 4 | 5;
      const res = await fetch("/api/ai/practice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          concept: { title: c.title, description: c.description },
          difficulty: diff,
          workspaceId: ws.id,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "generate failed");
      const p: PracticeProblem = { ...data.problem, conceptId: c.id };
      addProblem(ws.id, p);
      setActiveConcept(c.id);
      setActiveProblem(p.id);
      toast.success("New problem generated.");
    } catch {
      toast.error("Couldn't generate a problem.");
    } finally {
      setGenerating(false);
    }
  };

  const handleNewProblem = () => {
    if (!ws || !concept) return;
    const others = ws.problems.filter(
      (p) => p.conceptId === concept.id && p.id !== problem?.id
    );
    if (others.length) {
      setActiveProblem(others[0].id);
    } else {
      handleGenerate();
    }
  };

  const handleNextProblem = () => {
    if (!ws || !concept) return;
    const next = pickNextProblem(ws, concept.id);
    if (next) {
      setActiveConcept(next.concept.id);
      setActiveProblem(next.problem.id);
      return;
    }
    const nextConcept = pickNextConcept(ws, concept.id);
    if (nextConcept) {
      setActiveConcept(nextConcept.id);
      setActiveProblem(null);
      toast(`Moved to "${nextConcept.title}" — generate a problem to continue.`);
    } else {
      toast.success("You've worked through every available concept. Nice.");
    }
  };

  // ── render guards ────────────────────────────────────────────────────
  if (!ws) return null;
  if (!concept) {
    return (
      <div className="flex-1 grid place-items-center text-muted-foreground p-8 text-center">
        <div>
          <p className="font-serif text-xl text-foreground mb-1">
            No concepts yet.
          </p>
          <p className="text-sm">
            Add a topic map or run a placement test to start practising.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* ── top bar ──────────────────────────────────────────────────── */}
      <header className="shrink-0 px-4 sm:px-6 pt-4 pb-3 border-b bg-background/60">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono uppercase tracking-wide">
                {concept.unit}
              </span>
              <span className="size-1 rounded-full bg-muted-foreground/40" />
              <span>Practice</span>
            </div>
            <h2 className="font-serif text-2xl leading-tight mt-0.5">
              {concept.title}
            </h2>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <div className="flex items-center gap-2">
                <Progress
                  value={Math.round(concept.mastery * 100)}
                  className="h-1.5 w-28"
                />
                <span className="text-xs text-muted-foreground tabular-nums">
                  {Math.round(concept.mastery * 100)}% mastery
                </span>
              </div>
              {problem && (
                <Badge variant="outline" className="gap-1 text-[11px]">
                  <Flame className="size-3 text-warning-foreground" />
                  {DIFFICULTY_LABELS[problem.difficulty] ??
                    `Level ${problem.difficulty}`}
                </Badge>
              )}
              {concept.status === "mastered" && (
                <Badge className="gap-1 bg-primary/15 text-primary border-primary/30">
                  <CheckCircle2 className="size-3" /> Mastered
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {problem && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewProblem}
                className="gap-1.5"
              >
                <RotateCcw className="size-3.5" /> New problem
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => handleGenerate()}
              disabled={generating}
              className="gap-1.5"
            >
              {generating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Wand2 className="size-3.5" />
              )}
              Generate
            </Button>
          </div>
        </div>
      </header>

      {/* ── body: canvas + rail ──────────────────────────────────────── */}
      <div className="flex-1 min-h-0 lg:grid lg:grid-cols-[1fr_360px] lg:gap-4 p-4 sm:p-6 overflow-y-auto lg:overflow-hidden">
        {/* canvas column */}
        <div className="flex flex-col min-h-0 lg:overflow-hidden gap-3">
          {!problem ? (
            <div className="flex-1 grid place-items-center">
              <div className="text-center max-w-sm">
                <div className="mx-auto size-12 grid place-items-center rounded-full bg-warning/10 text-warning-foreground mb-3">
                  <Wand2 className="size-5" />
                </div>
                <h3 className="font-serif text-xl">
                  No problem loaded for {concept.title}
                </h3>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                  Generate an exam-style problem calibrated to this concept, or
                  switch concepts from the topic map.
                </p>
                <Button
                  onClick={() => handleGenerate()}
                  disabled={generating}
                  className="gap-1.5"
                >
                  {generating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  Generate a problem
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* problem statement */}
              <Card className="shrink-0 py-4 px-5 gap-3 paper-grain">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <BookOpen className="size-3.5" />
                  <span className="uppercase tracking-wide font-mono">
                    Problem
                  </span>
                  {problem.source === "past-paper" && (
                    <Badge variant="secondary" className="text-[10px] ml-1">
                      past paper
                    </Badge>
                  )}
                  {problem.source === "ai" && (
                    <Badge variant="secondary" className="text-[10px] ml-1">
                      AI-generated
                    </Badge>
                  )}
                  {problem.topic && (
                    <span className="text-[11px] text-muted-foreground/70 ml-auto truncate">
                      {problem.topic}
                    </span>
                  )}
                </div>
                <p className="text-[15px] leading-relaxed">{problem.prompt}</p>
                {problem.latex && (
                  <div className="rounded-xl bg-muted/50 p-4 dot-grid overflow-x-auto scroll-fancy">
                    <SmartTex display className="text-lg leading-relaxed">
                      {problem.latex}
                    </SmartTex>
                  </div>
                )}
              </Card>

              {/* steps list */}
              <div className="flex-1 min-h-0 overflow-y-auto scroll-fancy pr-1 -mr-1">
                {steps.length === 0 ? (
                  <div className="h-full grid place-items-center text-center py-10">
                    <div className="text-sm text-muted-foreground max-w-xs">
                      <p className="font-serif text-lg text-foreground mb-1">
                        Start solving.
                      </p>
                      Write your first step below. Prism stays quiet while you're
                      on the right track.
                    </div>
                  </div>
                ) : (
                  <ol className="flex flex-col gap-2.5 pb-2">
                    {steps.map((s, i) => (
                      <StepRow
                        key={s.id}
                        step={s}
                        index={i}
                        checking={checkingStepId === s.id}
                      />
                    ))}
                  </ol>
                )}
              </div>

              {/* input area */}
              {solved ? (
                <div className="shrink-0 rounded-xl border border-dashed border-primary/30 bg-primary/[0.03] px-4 py-3 text-center text-sm text-primary flex items-center justify-center gap-2">
                  <CheckCircle2 className="size-4" />
                  Solved — see the better-method note in the rail.
                </div>
              ) : (
                <div className="shrink-0 space-y-2">
                  <ConfidenceTap value={confidence} onChange={setConfidence} />
                  <MathInput
                    value={input}
                    onChange={(v) => {
                      setInput(v);
                      resetIdle();
                    }}
                    onSubmit={handleSubmitStep}
                    disabled={submitting}
                    submitLabel="Submit step"
                    autoFocus
                  />
                  <div className="flex items-center justify-between gap-2">
                    {steps.length > 0 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleImDone}
                        disabled={betterLoading || submitting}
                        className="text-muted-foreground gap-1.5"
                      >
                        {betterLoading ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-3.5" />
                        )}
                        I'm done — check my solution
                      </Button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/70 pl-1">
                        Enter to submit · ⌘/Ctrl+Enter also works
                      </span>
                    )}
                    <Button
                      onClick={handleSubmitStep}
                      disabled={submitting || !input.trim()}
                      className="gap-1.5"
                    >
                      {submitting ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                      Submit step
                      <ChevronRight className="size-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* right rail */}
        <aside className="flex flex-col gap-3 lg:overflow-y-auto lg:min-h-0 scroll-fancy mt-4 lg:mt-0">
          {/* concept context */}
          <Card className="px-4 py-3 gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide font-mono text-muted-foreground">
                Concept
              </span>
              <Badge variant="outline" className="text-[10px] gap-1">
                <Flame className="size-2.5 text-warning-foreground" />
                {Math.round(concept.examWeight * 100)}% exam weight
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {concept.description}
            </p>
            <div className="flex items-center gap-2 pt-0.5">
              <Progress
                value={Math.round(concept.mastery * 100)}
                className="h-1 flex-1"
              />
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {Math.round(concept.mastery * 100)}%
              </span>
            </div>
          </Card>

          {/* stuck bubble + hint ladder */}
          {!solved && problem && (
            <Card className="gap-0 p-0 overflow-hidden">
              <button
                onClick={() => setStuckOpen((v) => !v)}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-4 py-3 text-left transition-colors",
                  "bg-warning/5 hover:bg-warning/10 border-b border-warning/15",
                  pulseStuck && "animate-soft-pulse"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="size-8 grid place-items-center rounded-full bg-warning/15 text-warning-foreground shrink-0">
                    <LifeBuoy className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">
                      Stuck?
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {stuckOpen
                        ? "Tap a rung — Prism climbs with you."
                        : pulseStuck
                        ? "Open when you're ready for a nudge."
                        : "Open the hint ladder."}
                    </div>
                  </div>
                </div>
                <ChevronRight
                  className={cn(
                    "size-4 text-muted-foreground transition-transform shrink-0",
                    stuckOpen && "rotate-90"
                  )}
                />
              </button>
              <AnimatePresence initial={false}>
                {stuckOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="p-3 space-y-2">
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-1">
                        <Lightbulb className="size-3" /> Hint ladder — try the
                        smallest nudge first.
                      </div>
                      {HINT_RUNGS.map((rung) => {
                        const used = hintResults[rung.level] != null;
                        const loading = hintLoading[rung.level];
                        return (
                          <div key={rung.level} className="space-y-1.5">
                            <button
                              onClick={() => handleHint(rung.level)}
                              disabled={loading}
                              className={cn(
                                "w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-all",
                                "border-border bg-card hover:bg-accent/60",
                                used && "border-warning/30 bg-warning/5",
                                rung.level === 4 &&
                                  "border-destructive/20 hover:bg-destructive/5"
                              )}
                            >
                              <div
                                className={cn(
                                  "size-7 grid place-items-center rounded-md shrink-0",
                                  rung.level === 4
                                    ? "bg-destructive/10 text-destructive"
                                    : "bg-warning/10 text-warning-foreground"
                                )}
                              >
                                {rung.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
                                  {rung.label}
                                  {used && (
                                    <Check className="size-3 text-primary" />
                                  )}
                                </div>
                                <div className="text-[11px] text-muted-foreground truncate">
                                  {rung.description}
                                </div>
                              </div>
                              {loading ? (
                                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                              ) : (
                                <span className="text-[10px] font-mono text-muted-foreground/70">
                                  L{rung.level}
                                </span>
                              )}
                            </button>
                            {hintResults[rung.level] != null && (
                              <motion.div
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={cn(
                                  "rounded-lg border p-3 ml-2",
                                  rung.level === 4
                                    ? "bg-destructive/5 border-destructive/20"
                                    : "bg-warning/5 border-warning/20"
                                )}
                              >
                                <div className="text-[10px] uppercase tracking-wide font-mono text-muted-foreground mb-1.5 flex items-center gap-1">
                                  {rung.level === 4 ? (
                                    <BookOpen className="size-3" />
                                  ) : (
                                    <Lightbulb className="size-3" />
                                  )}
                                  {rung.level === 4
                                    ? "Full solution"
                                    : `Hint · level ${rung.level}`}
                                </div>
                                {rung.level === 4 ? (
                                  <Markdown className="text-sm">
                                    {hintResults[rung.level]}
                                  </Markdown>
                                ) : (
                                  <p className="text-sm leading-relaxed text-foreground">
                                    {hintResults[rung.level]}
                                  </p>
                                )}
                              </motion.div>
                            )}
                          </div>
                        );
                      })}
                      {(hintsUsedLocal > 0 || fullRevealsLocal > 0) && (
                        <div className="text-[11px] text-muted-foreground px-1 pt-1 flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Lightbulb className="size-3" /> {hintsUsedLocal}{" "}
                            hint{hintsUsedLocal !== 1 ? "s" : ""}
                          </span>
                          {fullRevealsLocal > 0 && (
                            <span className="flex items-center gap-1 text-destructive">
                              <BookOpen className="size-3" /> {fullRevealsLocal}{" "}
                              full reveal{fullRevealsLocal !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          )}

          {/* better-method / solved card */}
          <AnimatePresence>
            {solved && attempt?.betterMethod != null && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.34, ease: [0.2, 0.7, 0.2, 1] }}
              >
                <Card className="px-4 py-4 gap-3 border-primary/30 bg-primary/[0.03]">
                  <div className="flex items-center gap-2.5">
                    <div className="size-9 grid place-items-center rounded-full bg-primary/15 text-primary">
                      <PartyPopper className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-serif text-lg leading-tight">
                        Solved.
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Here's the path examiners expect.
                      </div>
                    </div>
                  </div>
                  <Separator />
                  <Markdown className="text-sm">
                    {attempt.betterMethod}
                  </Markdown>
                  <Separator />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-primary" />
                      {concept.title} →{" "}
                      {Math.round(Math.min(1, concept.mastery) * 100)}% mastery
                    </span>
                    {(hintsUsedLocal > 0 || fullRevealsLocal > 0) && (
                      <span className="flex items-center gap-2">
                        {hintsUsedLocal > 0 && (
                          <span className="flex items-center gap-1">
                            <Lightbulb className="size-3" />
                            {hintsUsedLocal}
                          </span>
                        )}
                        {fullRevealsLocal > 0 && (
                          <span className="flex items-center gap-1 text-destructive">
                            <BookOpen className="size-3" />
                            {fullRevealsLocal}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <Button onClick={handleNextProblem} className="w-full gap-1.5">
                    Next problem <ArrowRight className="size-4" />
                  </Button>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {celebrating && !solved && (
            <div className="text-center text-xs text-primary flex items-center justify-center gap-1.5 py-1">
              <Loader2 className="size-3.5 animate-spin" />
              Comparing your path to alternatives…
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ── StepRow ─────────────────────────────────────────────────────────────────

function StepRow({
  step,
  index,
  checking,
}: {
  step: AttemptStep;
  index: number;
  checking: boolean;
}) {
  const isCorrect = step.checkedAt != null && step.correct;
  const isWrong = step.checkedAt != null && !step.correct;
  const isSoft = isWrong && (step.errorType === "none" || !step.errorType);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
      className={cn(
        "list-none rounded-xl border bg-card px-4 py-3 relative",
        isWrong && !isSoft && "border-destructive/30 bg-destructive/[0.04]",
        isCorrect && "border-primary/25"
      )}
    >
      <div className="flex items-start gap-3">
        {/* step number / state badge */}
        <motion.div
          animate={{
            scale: isCorrect || isWrong ? [1, 1.12, 1] : 1,
          }}
          transition={{ duration: 0.3 }}
          className={cn(
            "shrink-0 size-6 grid place-items-center rounded-full text-[11px] font-mono transition-colors",
            isCorrect
              ? "bg-primary/15 text-primary"
              : isWrong && !isSoft
              ? "bg-destructive/15 text-destructive"
              : "bg-muted text-muted-foreground"
          )}
        >
          {isCorrect ? (
            <Check className="size-3.5" />
          ) : isWrong && !isSoft ? (
            <CircleAlert className="size-3.5" />
          ) : (
            index + 1
          )}
        </motion.div>

        <div className="flex-1 min-w-0">
          {/* step content */}
          <div className="text-[15px] leading-relaxed overflow-x-auto scroll-fancy py-0.5">
            <SmartTex>{step.latex}</SmartTex>
          </div>

          {/* meta row */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <ConfidenceBadge value={step.confidence} />
            {checking && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground animate-soft-pulse">
                <Loader2 className="size-3 animate-spin" /> Prism is checking…
              </span>
            )}
            {isWrong &&
              !isSoft &&
              step.errorType &&
              step.errorType !== "none" && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-destructive/40 text-destructive gap-1"
                >
                  <CircleAlert className="size-3" />{" "}
                  {ERROR_LABELS[step.errorType]}
                </Badge>
              )}
            {isSoft && (
              <Badge
                variant="outline"
                className="text-[10px] text-muted-foreground gap-1"
              >
                <CircleAlert className="size-3" /> Unchecked
              </Badge>
            )}
          </div>

          {/* feedback — SILENT when correct (the thesis) */}
          {isWrong && !isSoft && step.feedback && (
            <div className="mt-2 text-sm text-foreground/80 leading-relaxed border-l-2 border-destructive/40 pl-2.5">
              {step.feedback}
            </div>
          )}
          {isSoft && step.feedback && (
            <div className="mt-2 text-xs text-muted-foreground leading-relaxed border-l-2 border-muted-foreground/30 pl-2.5">
              {step.feedback}
            </div>
          )}
        </div>
      </div>
    </motion.li>
  );
}

// ── ConfidenceBadge (read-only, on each step) ───────────────────────────────

function ConfidenceBadge({ value }: { value: Confidence }) {
  const opt = CONFIDENCE_OPTIONS.find((c) => c.value === value)!;
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] gap-1 font-normal", opt.badge)}
    >
      {opt.icon} {opt.label}
    </Badge>
  );
}

// ── ConfidenceTap (interactive, above the input) ────────────────────────────

function ConfidenceTap({
  value,
  onChange,
}: {
  value: Confidence;
  onChange: (v: Confidence) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[11px] text-muted-foreground mr-1 hidden sm:inline">
        Confidence:
      </span>
      {CONFIDENCE_OPTIONS.map((opt) => {
        const on = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            data-on={on}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-all",
              "border-border bg-card text-muted-foreground hover:bg-accent/60",
              on && cn(opt.on, "shadow-xs")
            )}
          >
            {opt.icon} {opt.label}
          </button>
        );
      })}
    </div>
  );
}
