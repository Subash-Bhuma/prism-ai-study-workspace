"use client";

import { useState } from "react";
import { useActiveWorkspace, useMira, uid } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Markdown } from "@/components/math";
import { motion } from "framer-motion";
import {
  Sparkles,
  PenLine,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  FileText,
  BookOpen,
  Loader2,
  Eraser,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { TheoryQAPair } from "@/lib/types";

type RubricKey = "definition" | "diagram" | "derivation" | "example";
const RUBRIC_LABELS: Record<RubricKey, string> = {
  definition: "Definition stated",
  diagram: "Diagram / sketch included",
  derivation: "Derivation steps present",
  example: "Worked example",
};
const RUBRIC_ORDER: RubricKey[] = ["definition", "diagram", "derivation", "example"];

type Mode = "generate" | "grade";

export function TheoryView() {
  const ws = useActiveWorkspace();
  const { addTheory } = useMira();

  const [mode, setMode] = useState<Mode>("generate");
  const [question, setQuestion] = useState("");
  const [studentAnswer, setStudentAnswer] = useState("");
  const [conceptId, setConceptId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TheoryQAPair | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!ws) return null;

  const reset = () => {
    setResult(null);
    setQuestion("");
    setStudentAnswer("");
    setConceptId("");
  };

  const handleGenerate = async () => {
    if (!question.trim()) {
      toast.error("Write a question first.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const concept = ws.concepts.find((c) => c.id === conceptId);
      const res = await fetch("/api/ai/theory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          context: concept?.description,
          workspaceId: ws.id,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Generation failed");
      const pair: TheoryQAPair = {
        id: uid("th"),
        conceptId: conceptId || undefined,
        question,
        generatedAnswer: data.answer,
        rubric: data.rubric,
        createdAt: Date.now(),
      };
      setResult(pair);
      toast.success("Model answer generated.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleGrade = async () => {
    if (!question.trim() || !studentAnswer.trim()) {
      toast.error("Write a question and your answer.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/ai/grade-theory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, studentAnswer }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Grading failed");
      const pair: TheoryQAPair = {
        id: uid("th"),
        conceptId: conceptId || undefined,
        question,
        studentAnswer,
        rubric: data.rubric,
        score: data.score,
        feedback: data.feedback,
        createdAt: Date.now(),
      };
      setResult(pair);
      toast.success("Answer graded against the structural rubric.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Grading failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (!result) return;
    addTheory(ws.id, result);
    toast.success("Saved to your theory log.");
    reset();
  };

  return (
    <div className="flex-1 overflow-y-auto scroll-fancy">
      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-6 sm:py-8">
        {/* header */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <FileText className="size-3.5" />
            <span>Theory & written answers</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl">
            Write the answer an examiner expects.
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
            Generate a model answer from your own material — or write yours and have Prism grade it against a structural rubric.{" "}
            <span className="ink-underline">Theory answers lose marks on structure & completeness, not step-correctness.</span>
          </p>
        </motion.div>

        <Tabs
          value={mode}
          onValueChange={(v) => {
            setMode(v as Mode);
            setResult(null);
          }}
        >
          <TabsList className="mb-5">
            <TabsTrigger value="generate" className="gap-1.5">
              <Sparkles className="size-3.5" /> Generate from my material
            </TabsTrigger>
            <TabsTrigger value="grade" className="gap-1.5">
              <PenLine className="size-3.5" /> Write your own & grade it
            </TabsTrigger>
          </TabsList>

          <div className="grid lg:grid-cols-2 gap-5">
            {/* LEFT — input */}
            <Card className="p-5 flex flex-col gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Question
                </label>
                <Textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g. State and derive the integrating factor for a linear first-order ODE."
                  className="min-h-[88px] resize-y"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Concept{" "}
                  <span className="text-muted-foreground/60">
                    (optional — gives Prism your material's context)
                  </span>
                </label>
                <Select value={conceptId} onValueChange={setConceptId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pick a concept" />
                  </SelectTrigger>
                  <SelectContent>
                    {ws.concepts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {mode === "grade" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Your answer
                  </label>
                  <Textarea
                    value={studentAnswer}
                    onChange={(e) => setStudentAnswer(e.target.value)}
                    placeholder="Write your full answer. Include a definition, a diagram (or its description), derivation steps, and a worked example."
                    className="min-h-[240px] resize-y font-serif text-[15px] leading-relaxed"
                  />
                  <p className="text-[11px] text-muted-foreground/80 mt-1.5 leading-relaxed">
                    Tip: Prism grades on the structural rubric examiners use —
                    did you include a <strong className="text-foreground">definition</strong>,{" "}
                    <strong className="text-foreground">diagram</strong>,{" "}
                    <strong className="text-foreground">derivation</strong>, and{" "}
                    <strong className="text-foreground">example</strong>? Marks come from
                    completeness, not step-correctness.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button
                  onClick={mode === "generate" ? handleGenerate : handleGrade}
                  disabled={loading}
                  className="gap-1.5"
                >
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : mode === "generate" ? (
                    <Sparkles className="size-4" />
                  ) : (
                    <PenLine className="size-4" />
                  )}
                  {mode === "generate" ? "Generate answer" : "Grade my answer"}
                </Button>
                {(result || question || studentAnswer) && (
                  <Button variant="ghost" onClick={reset} className="gap-1.5">
                    <Eraser className="size-3.5" /> Clear
                  </Button>
                )}
              </div>
            </Card>

            {/* RIGHT — result */}
            <Card
              className={cn(
                "p-5 flex flex-col gap-4 min-h-[320px]",
                loading && "glow-ring"
              )}
            >
              <ResultPanel
                loading={loading}
                result={result}
                mode={mode}
                onSave={handleSave}
              />
            </Card>
          </div>
        </Tabs>

        {/* history */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-xl">Theory log</h2>
            <Badge variant="secondary">{ws.theory.length} saved</Badge>
          </div>
          {ws.theory.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              <FileText className="size-5 mx-auto mb-2 opacity-50" />
              Nothing saved yet. Generate or grade an answer to start your log.
            </Card>
          ) : (
            <div className="space-y-2">
              {[...ws.theory].reverse().map((t) => (
                <HistoryItem
                  key={t.id}
                  item={t}
                  expanded={expandedId === t.id}
                  onToggle={() =>
                    setExpandedId(expandedId === t.id ? null : t.id)
                  }
                  conceptTitle={
                    ws.concepts.find((c) => c.id === t.conceptId)?.title
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultPanel({
  loading,
  result,
  mode,
  onSave,
}: {
  loading: boolean;
  result: TheoryQAPair | null;
  mode: Mode;
  onSave: () => void;
}) {
  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center py-10 gap-3">
        <Loader2 className="size-6 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground animate-soft-pulse">
          {mode === "generate"
            ? "Prism is drafting a model answer from your material…"
            : "Prism is grading against the structural rubric…"}
        </p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center py-10 text-muted-foreground">
        <BookOpen className="size-6 mb-2 opacity-50" />
        <p className="text-sm max-w-xs leading-relaxed">
          {mode === "generate"
            ? "Your model answer will appear here, with a rubric checklist confirming each structural piece."
            : "Your score, rubric breakdown, and feedback will appear here. Prism names which piece cost marks."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 animate-step-in">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Badge variant="outline" className="gap-1 text-[11px]">
          {mode === "generate" ? (
            <>
              <Sparkles className="size-3" /> Generated
            </>
          ) : (
            <>
              <PenLine className="size-3" /> Graded
            </>
          )}
        </Badge>
        <div className="flex items-center gap-2">
          {mode === "grade" && result.score != null && (
            <ScoreBadge score={result.score} />
          )}
          <Button size="sm" variant="outline" onClick={onSave} className="gap-1.5">
            Save to log
          </Button>
        </div>
      </div>

      {/* rubric */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Structural rubric
        </div>
        <div className="grid grid-cols-2 gap-2">
          {RUBRIC_ORDER.map((k) => (
            <RubricItem
              key={k}
              label={RUBRIC_LABELS[k]}
              checked={result.rubric[k]}
            />
          ))}
        </div>
      </div>

      {result.generatedAnswer && (
        <div className="rounded-lg border bg-muted/30 p-4 max-h-[420px] overflow-y-auto scroll-fancy">
          <Markdown>{result.generatedAnswer}</Markdown>
        </div>
      )}

      {result.feedback && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-1">
            What cost marks
          </div>
          <p className="text-sm leading-relaxed">{result.feedback}</p>
        </div>
      )}
    </div>
  );
}

function RubricItem({ label, checked }: { label: string; checked: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
        checked
          ? "border-emerald-500/30 bg-emerald-500/8"
          : "border-rose-500/25 bg-rose-500/5"
      )}
    >
      <div
        className={cn(
          "size-5 rounded-full grid place-items-center shrink-0",
          checked
            ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
            : "bg-rose-500/20 text-rose-600 dark:text-rose-400"
        )}
      >
        {checked ? <Check className="size-3" /> : <X className="size-3" />}
      </div>
      <span className={checked ? "text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 80 ? "emerald" : score >= 60 ? "amber" : "rose";
  const tones = {
    emerald:
      "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
  };
  return (
    <Badge className={cn("text-sm font-mono tabular-nums", tones[tone])}>
      {score}
      <span className="text-[10px] opacity-60 ml-0.5">/100</span>
    </Badge>
  );
}

function HistoryItem({
  item,
  expanded,
  onToggle,
  conceptTitle,
}: {
  item: TheoryQAPair;
  expanded: boolean;
  onToggle: () => void;
  conceptTitle?: string;
}) {
  const isGenerated = !!item.generatedAnswer;
  return (
    <Card className="overflow-hidden py-0">
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/40 transition-colors"
      >
        <div
          className={cn(
            "size-7 rounded-md grid place-items-center shrink-0",
            isGenerated
              ? "bg-primary/10 text-primary"
              : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          )}
        >
          {isGenerated ? (
            <Sparkles className="size-3.5" />
          ) : (
            <PenLine className="size-3.5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{item.question}</div>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
            <span>{isGenerated ? "Generated" : "Graded"}</span>
            {conceptTitle && (
              <>
                <span className="size-1 rounded-full bg-muted-foreground/40" />
                <span>{conceptTitle}</span>
              </>
            )}
            {item.score != null && (
              <>
                <span className="size-1 rounded-full bg-muted-foreground/40" />
                <span className="tabular-nums">{item.score}/100</span>
              </>
            )}
            <span className="size-1 rounded-full bg-muted-foreground/40" />
            <span>{formatRelative(item.createdAt)}</span>
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="size-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-1 animate-step-in">
          <div className="grid sm:grid-cols-2 gap-2 mb-3">
            {RUBRIC_ORDER.map((k) => (
              <RubricItem
                key={k}
                label={RUBRIC_LABELS[k]}
                checked={item.rubric[k]}
              />
            ))}
          </div>
          {item.score != null && (
            <div className="mb-3 flex items-center gap-3">
              <span className="text-xs font-medium text-muted-foreground">
                Score
              </span>
              <ScoreBadge score={item.score} />
            </div>
          )}
          {item.studentAnswer && (
            <div className="mb-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Your answer
              </div>
              <div className="text-sm leading-relaxed whitespace-pre-wrap rounded-md border bg-muted/30 p-3 font-serif">
                {item.studentAnswer}
              </div>
            </div>
          )}
          {item.generatedAnswer && (
            <div className="mb-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Model answer
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <Markdown>{item.generatedAnswer}</Markdown>
              </div>
            </div>
          )}
          {item.feedback && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              {item.feedback}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
