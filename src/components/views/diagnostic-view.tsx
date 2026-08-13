"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActiveWorkspace, useMira } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/math";
import { motion, AnimatePresence } from "framer-motion";
import {
  Stethoscope,
  Loader2,
  Check,
  X,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  BookOpen,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Concept, DiagnosticQuestion } from "@/lib/types";

type Phase = "loading" | "active" | "results" | "error";
type Answer = { questionId: string; conceptTitle: string; selectedIndex: number | null; correct: boolean };

export function DiagnosticView({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <DiagnosticOverlay
          key="diag-overlay"
          onOpenChange={onOpenChange}
          onDone={onDone}
        />
      )}
    </AnimatePresence>
  );
}

function DiagnosticOverlay({
  onOpenChange,
  onDone,
}: {
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
}) {
  const ws = useActiveWorkspace();
  const { setDiagnostic, updateConcept } = useMira();

  const [phase, setPhase] = useState<Phase>("loading");
  const [questions, setQuestions] = useState<DiagnosticQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const fetchedRef = useRef(false);

  const fetchQuestions = useCallback(async () => {
    if (!ws || ws.concepts.length === 0) {
      setPhase("error");
      return;
    }
    setPhase("loading");
    try {
      const res = await fetch("/api/ai/diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: ws.name,
          concepts: ws.concepts.map((c) => ({
            title: c.title,
            description: c.description,
          })),
        }),
      });
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.questions) || data.questions.length === 0) {
        throw new Error(data.error || "No questions returned.");
      }
      setQuestions(data.questions);
      setIndex(0);
      setAnswers([]);
      setSelected(null);
      setLocked(false);
      setPhase("active");
    } catch {
      setPhase("error");
    }
  }, [ws]);

  // Fetch questions once on mount.
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchQuestions();
  }, [fetchQuestions]);

  // Escape to exit (without saving)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange]);

  const current = questions[index];

  const handleSelect = useCallback(
    (i: number) => {
      if (locked || !current) return;
      setSelected(i);
      setLocked(true);
      const correct = i === current.correctIndex;
      setAnswers((prev) => [
        ...prev,
        {
          questionId: current.id,
          conceptTitle: current.conceptId, // actually the concept title per API
          selectedIndex: i,
          correct,
        },
      ]);
    },
    [locked, current]
  );

  const handleSkip = useCallback(() => {
    if (locked || !current) return;
    setSelected(null);
    setLocked(true);
    setAnswers((prev) => [
      ...prev,
      {
        questionId: current.id,
        conceptTitle: current.conceptId,
        selectedIndex: null,
        correct: false,
      },
    ]);
  }, [locked, current]);

  const handleNext = useCallback(() => {
    if (index + 1 >= questions.length) {
      setPhase("results");
    } else {
      setIndex((i) => i + 1);
      setSelected(null);
      setLocked(false);
    }
  }, [index, questions.length]);

  // Build per-concept aggregation
  const perConceptStats = useMemo(() => {
    const map = new Map<string, { total: number; correct: number }>();
    answers.forEach((a) => {
      const cur = map.get(a.conceptTitle) ?? { total: 0, correct: 0 };
      cur.total++;
      if (a.correct) cur.correct++;
      map.set(a.conceptTitle, cur);
    });
    return map;
  }, [answers]);

  const titleToId = useMemo(
    () => new Map<string, string>((ws?.concepts ?? []).map((c) => [c.title, c.id])),
    [ws]
  );

  const handleApply = useCallback(() => {
    if (!ws) return;

    const total = questions.length;
    const correct = answers.filter((a) => a.correct).length;

    const perConcept = Array.from(perConceptStats.entries()).map(([title, stats]) => ({
      conceptId: titleToId.get(title) ?? title,
      correct: stats.correct >= Math.ceil(stats.total / 2),
    }));

    setDiagnostic(ws.id, {
      completedAt: Date.now(),
      total,
      correct,
      perConcept,
    });

    // update concept mastery + unlock
    perConceptStats.forEach((stats, title) => {
      const conceptId = titleToId.get(title);
      if (!conceptId) return;
      const concept = ws.concepts.find((c) => c.id === conceptId);
      if (!concept) return;
      const patch: Partial<Concept> = {};
      const majorityCorrect = stats.correct >= Math.ceil(stats.total / 2);
      if (majorityCorrect) {
        patch.mastery = Math.min(1, +(concept.mastery + 0.15).toFixed(2));
      }
      if (concept.status === "locked" && stats.correct > 0) {
        patch.status = "available";
      }
      if (Object.keys(patch).length > 0) {
        updateConcept(ws.id, conceptId, patch);
      }
    });

    toast.success(
      `Placement applied: ${correct}/${total} correct. ${
        perConcept.filter((p) => p.correct).length
      } concept${perConcept.filter((p) => p.correct).length === 1 ? "" : "s"} strengthened.`
    );
    onOpenChange(false);
    onDone?.();
  }, [ws, questions, answers, perConceptStats, titleToId, setDiagnostic, updateConcept, onOpenChange, onDone]);

  // Empty workspace state — handled as a special "error" with different copy
  if (!ws || ws.concepts.length === 0) {
    return (
      <OverlayShell onOpenChange={onOpenChange}>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 max-w-md mx-auto">
          <div className="size-14 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 grid place-items-center mb-4">
            <BookOpen className="size-7" />
          </div>
          <h2 className="font-serif text-2xl mb-2">Upload material first</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            Prism builds the placement test from your uploaded concepts. Add some
            sources to your subject and Prism will map the curriculum — then come
            back to place yourself accurately.
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="gap-1.5">
            Close
          </Button>
        </div>
      </OverlayShell>
    );
  }

  return (
    <OverlayShell onOpenChange={onOpenChange}>
      {phase === "loading" && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 max-w-md mx-auto">
          <div className="relative mb-6">
            <div className="size-16 rounded-2xl bg-primary/10 text-primary grid place-items-center">
              <Stethoscope className="size-8" />
            </div>
            <div className="absolute -inset-2 rounded-3xl bg-primary/10 blur-xl -z-10 animate-soft-pulse" />
          </div>
          <h2 className="font-serif text-2xl mb-2">Prism is preparing your placement test.</h2>
          <p className="text-sm text-muted-foreground animate-soft-pulse">
            10–12 adaptive questions, sampling your syllabus. About 5 minutes.
          </p>
          <div className="flex items-center gap-1.5 mt-6 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            <span>Reading your concepts…</span>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 max-w-md mx-auto">
          <div className="size-14 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 grid place-items-center mb-4">
            <AlertTriangle className="size-7" />
          </div>
          <h2 className="font-serif text-2xl mb-2">Couldn't generate questions.</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            The AI service took too long or returned an unexpected response. You can
            retry, or close and try again later.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => fetchQuestions()}
              className="gap-1.5"
            >
              <RotateCcw className="size-4" /> Retry
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      )}

      {phase === "active" && current && (
        <ActivePhase
          question={current}
          index={index}
          total={questions.length}
          selected={selected}
          locked={locked}
          onSelect={handleSelect}
          onSkip={handleSkip}
          onNext={handleNext}
          conceptTitle={
            ws.concepts.find((c) => c.title === current.conceptId)?.title ??
            current.conceptId
          }
        />
      )}

      {phase === "results" && (
        <ResultsPhase
          questions={questions}
          answers={answers}
          perConceptStats={perConceptStats}
          conceptMap={ws.concepts}
          onApply={handleApply}
          onOpenChange={onOpenChange}
        />
      )}
    </OverlayShell>
  );
}

function OverlayShell({
  onOpenChange,
  children,
}: {
  onOpenChange: (o: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 bg-background flex flex-col"
    >
      <div className="border-b bg-background/80 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-md bg-primary/10 text-primary grid place-items-center">
            <Stethoscope className="size-4" />
          </div>
          <span className="font-serif text-base">Placement check</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onOpenChange(false)}
          className="text-muted-foreground"
        >
          Skip placement
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scroll-fancy">
        <div className="max-w-2xl mx-auto px-6 py-8 sm:py-12 flex flex-col min-h-full">
          {children}
        </div>
      </div>
    </motion.div>
  );
}

function ActivePhase({
  question,
  index,
  total,
  selected,
  locked,
  onSelect,
  onSkip,
  onNext,
  conceptTitle,
}: {
  question: DiagnosticQuestion;
  index: number;
  total: number;
  selected: number | null;
  locked: boolean;
  onSelect: (i: number) => void;
  onSkip: () => void;
  onNext: () => void;
  conceptTitle: string;
}) {
  const progress = ((index + (locked ? 1 : 0)) / total) * 100;
  const isCorrect = locked && selected === question.correctIndex;

  return (
    <div className="flex flex-col flex-1">
      {/* progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <span>
            Question{" "}
            <span className="text-foreground font-medium tabular-nums">
              {index + 1}
            </span>{" "}
            of <span className="tabular-nums">{total}</span>
          </span>
          <Badge variant="outline" className="text-[10px]">
            {conceptTitle}
          </Badge>
        </div>
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <motion.div
            className="h-full bg-primary"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={question.id}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.22 }}
          className="flex flex-col flex-1"
        >
          {/* prompt */}
          <div className="rounded-xl border bg-card p-5 mb-5">
            <Markdown className="text-base">{question.prompt}</Markdown>
          </div>

          {/* options */}
          <div className="grid gap-2 mb-4">
            {question.options.slice(0, 4).map((opt, i) => {
              const isSelected = selected === i;
              const isCorrectOption = i === question.correctIndex;
              const showState = locked && (isSelected || isCorrectOption);
              return (
                <button
                  key={i}
                  onClick={() => onSelect(i)}
                  disabled={locked}
                  className={cn(
                    "group flex items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-all",
                    !locked && "hover:border-primary/40 hover:bg-primary/5",
                    showState && isCorrectOption && "border-emerald-500/50 bg-emerald-500/8",
                    showState && isSelected && !isCorrectOption && "border-rose-500/50 bg-rose-500/8",
                    !showState && "border-border bg-card",
                    locked && !showState && "opacity-60"
                  )}
                >
                  <div
                    className={cn(
                      "size-6 rounded-md grid place-items-center shrink-0 text-xs font-mono font-medium border transition-colors",
                      showState && isCorrectOption
                        ? "border-emerald-500/50 bg-emerald-500 text-white"
                        : showState && isSelected && !isCorrectOption
                        ? "border-rose-500/50 bg-rose-500 text-white"
                        : "border-border bg-muted text-muted-foreground"
                    )}
                  >
                    {showState && isCorrectOption ? (
                      <Check className="size-3.5" />
                    ) : showState && isSelected && !isCorrectOption ? (
                      <X className="size-3.5" />
                    ) : (
                      String.fromCharCode(65 + i)
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <Markdown className="[&_p]:my-0">{opt}</Markdown>
                  </div>
                </button>
              );
            })}
          </div>

          {/* explanation */}
          <AnimatePresence>
            {locked && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={cn(
                  "rounded-lg border p-4 mb-4",
                  isCorrect
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : selected === null
                    ? "border-amber-500/30 bg-amber-500/5"
                    : "border-rose-500/30 bg-rose-500/5"
                )}
              >
                <div className="flex items-center gap-2 mb-1.5 text-xs font-semibold uppercase tracking-wide">
                  {isCorrect ? (
                    <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                      <Check className="size-3.5" /> Correct
                    </span>
                  ) : selected === null ? (
                    <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1">
                      <ChevronRight className="size-3.5" /> Skipped
                    </span>
                  ) : (
                    <span className="text-rose-700 dark:text-rose-400 flex items-center gap-1">
                      <X className="size-3.5" /> Not quite
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed">{question.explanation}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* footer actions */}
          <div className="mt-auto flex items-center justify-between pt-2">
            {!locked ? (
              <>
                <div className="text-xs text-muted-foreground">
                  Pick the best answer — or skip if you don't know.
                </div>
                <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
                  Skip
                </Button>
              </>
            ) : (
              <>
                <div className="text-xs text-muted-foreground">
                  {index + 1 >= total
                    ? "That was the last one."
                    : `Locked in. ${total - index - 1} to go.`}
                </div>
                <Button onClick={onNext} className="gap-1.5">
                  {index + 1 >= total ? "See results" : "Next question"}
                  <ChevronRight className="size-4" />
                </Button>
              </>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ResultsPhase({
  questions,
  answers,
  perConceptStats,
  conceptMap,
  onApply,
  onOpenChange,
}: {
  questions: DiagnosticQuestion[];
  answers: Answer[];
  perConceptStats: Map<string, { total: number; correct: number }>;
  conceptMap: Concept[];
  onApply: () => void;
  onOpenChange: (o: boolean) => void;
}) {
  const total = questions.length;
  const correct = answers.filter((a) => a.correct).length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

  const byConcept = Array.from(perConceptStats.entries()).map(([title, stats]) => {
    const concept = conceptMap.find((c) => c.title === title);
    return {
      title,
      total: stats.total,
      correct: stats.correct,
      majority: stats.correct >= Math.ceil(stats.total / 2),
      mastery: concept?.mastery ?? 0,
    };
  });

  const tone = pct >= 70 ? "emerald" : pct >= 40 ? "amber" : "rose";
  const tones = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    rose: "text-rose-600 dark:text-rose-400",
  };

  return (
    <div className="flex flex-col flex-1 animate-step-in">
      {/* hero score */}
      <div className="text-center mb-8">
        <div className="inline-flex size-14 rounded-2xl bg-primary/10 text-primary grid place-items-center mb-3">
          <Trophy className="size-7" />
        </div>
        <h2 className="font-serif text-2xl mb-1">Placement complete.</h2>
        <p className="text-sm text-muted-foreground mb-4">
          You scored{" "}
          <span className={cn("font-mono font-semibold tabular-nums", tones[tone])}>
            {correct}/{total}
          </span>{" "}
          ({pct}%).
        </p>
        <div className="max-w-xs mx-auto h-2 rounded-full bg-muted overflow-hidden">
          <motion.div
            className={cn(
              "h-full",
              tone === "emerald"
                ? "bg-emerald-500"
                : tone === "amber"
                ? "bg-amber-500"
                : "bg-rose-500"
            )}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, delay: 0.1 }}
          />
        </div>
      </div>

      {/* per-concept breakdown */}
      <div className="mb-6">
        <h3 className="font-serif text-lg mb-3">Per-concept breakdown</h3>
        <div className="space-y-2">
          {byConcept.map((c) => (
            <div
              key={c.title}
              className="flex items-center gap-3 rounded-lg border px-4 py-3"
            >
              <div
                className={cn(
                  "size-8 rounded-md grid place-items-center shrink-0",
                  c.majority
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : c.correct > 0
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                )}
              >
                {c.majority ? (
                  <Check className="size-4" />
                ) : c.correct > 0 ? (
                  <span className="text-xs font-mono tabular-nums">{c.correct}/{c.total}</span>
                ) : (
                  <X className="size-4" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.title}</div>
                <div className="text-[11px] text-muted-foreground">
                  {c.correct} of {c.total} correct · currently {Math.round(c.mastery * 100)}% mastery
                </div>
              </div>
              {c.majority ? (
                <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
                  +15% mastery
                </Badge>
              ) : c.correct > 0 ? (
                <Badge variant="outline" className="text-[10px]">
                  partial
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  no change
                </Badge>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* actions */}
      <div className="mt-auto pt-4 border-t flex flex-col sm:flex-row items-center gap-3 justify-between">
        <p className="text-xs text-muted-foreground text-center sm:text-left">
          <Sparkles className="size-3 inline mr-1" />
          Applying updates your concept mastery and unlocks the next concepts in your plan.
        </p>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
            Discard
          </Button>
          <Button onClick={onApply} className="gap-1.5 flex-1 sm:flex-none">
            Apply to my plan <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
