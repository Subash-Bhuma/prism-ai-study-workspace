"use client";

import { useMemo, useState } from "react";
import { useActiveWorkspace, useMira } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/math";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Clock,
  Target,
  Layers,
  Gauge,
  Sparkles,
  Loader2,
  AlertTriangle,
  TrendingDown,
  ArrowRight,
  Lightbulb,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ErrorType, DailyReport, Concept } from "@/lib/types";

const ERROR_META: Record<
  Exclude<ErrorType, "none">,
  { label: string; color: string }
> = {
  "sign-error": { label: "Sign error", color: "oklch(0.75 0.14 70)" }, // amber
  "wrong-formula": { label: "Wrong formula", color: "oklch(0.65 0.2 25)" }, // rose
  "conceptual-gap": { label: "Conceptual gap", color: "oklch(0.65 0.16 305)" }, // violet plum
  "arithmetic-slip": { label: "Arithmetic slip", color: "oklch(0.6 0.13 158)" }, // emerald
};
const ERROR_ORDER: Exclude<ErrorType, "none">[] = [
  "sign-error",
  "wrong-formula",
  "conceptual-gap",
  "arithmetic-slip",
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(mins: number): string {
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

interface ReportData {
  conceptsCovered: { id: string; title: string; mastery: number }[];
  timeSpentMin: number;
  accuracy: number;
  totalSteps: number;
  errorTypes: Record<ErrorType, number>;
  betterMethodsLearned: string[];
  remainingPct: number;
  hintTrend: { conceptId: string; title: string; fullReveals: number; hints: number }[];
  calibrationScore: number;
  tomorrowQueue: { conceptId: string; title: string; reason: string }[];
}

function computeReport(ws: {
  name: string;
  concepts: Concept[];
  attempts: { steps: { correct: boolean; confidence: string; errorType?: ErrorType; checkedAt?: number }[]; startedAt: number; completedAt?: number; betterMethod?: string; solved: boolean; conceptId: string }[];
  syllabusProgress: number;
}): ReportData {
  const attempts = ws.attempts;

  // concepts covered (distinct from attempts)
  const conceptIds = new Set<string>();
  attempts.forEach((a) => conceptIds.add(a.conceptId));
  const conceptsCovered = Array.from(conceptIds)
    .map((id) => {
      const c = ws.concepts.find((x) => x.id === id);
      return c ? { id: c.id, title: c.title, mastery: c.mastery } : null;
    })
    .filter(Boolean) as { id: string; title: string; mastery: number }[];

  // time spent: real or 4min/step estimate
  let timeSpentMin = 0;
  attempts.forEach((a) => {
    if (a.completedAt) {
      timeSpentMin += Math.max(1, (a.completedAt - a.startedAt) / 60000);
    } else {
      timeSpentMin += a.steps.length * 4;
    }
  });

  // accuracy from checked steps only
  let checkedCorrect = 0;
  let checkedTotal = 0;
  const errorTypes: Record<ErrorType, number> = {
    "sign-error": 0,
    "wrong-formula": 0,
    "conceptual-gap": 0,
    "arithmetic-slip": 0,
    none: 0,
  };
  // calibration: by confidence level
  const byConfidence: Record<string, { correct: number; total: number }> = {
    guessed: { correct: 0, total: 0 },
    "fairly-sure": { correct: 0, total: 0 },
    certain: { correct: 0, total: 0 },
  };

  attempts.forEach((a) => {
    a.steps.forEach((s) => {
      if (s.checkedAt != null || s.correct != null) {
        checkedTotal++;
        if (s.correct) checkedCorrect++;
        if (s.errorType && s.errorType !== "none") {
          errorTypes[s.errorType]++;
        }
        if (byConfidence[s.confidence]) {
          byConfidence[s.confidence].total++;
          if (s.correct) byConfidence[s.confidence].correct++;
        }
      }
    });
  });

  const accuracy = checkedTotal > 0 ? checkedCorrect / checkedTotal : 0;

  // better methods learned
  const betterMethodsLearned = attempts
    .filter((a) => a.solved && a.betterMethod)
    .map((a) => a.betterMethod!) as string[];

  // remaining
  const remainingPct = Math.max(0, Math.round((1 - ws.syllabusProgress) * 100));

  // hint trend from concept stats
  const hintTrend = ws.concepts
    .filter((c) => c.hintsUsed > 0 || c.fullReveals > 0)
    .map((c) => ({
      conceptId: c.id,
      title: c.title,
      fullReveals: c.fullReveals,
      hints: c.hintsUsed,
    }));

  // calibration: simple derivation from confidence vs correctness
  // ideal: certain >> fairly-sure >> guessed in accuracy
  let calibrationScore = 72; // fallback
  const cG = byConfidence.guessed;
  const cC = byConfidence.certain;
  if (cG.total >= 1 && cC.total >= 1) {
    const accGuessed = cG.correct / cG.total;
    const accCertain = cC.correct / cC.total;
    // distance from ideal (certain=1, guessed=0) → 100; equal → 50; inverted → 0
    calibrationScore = Math.round(
      Math.max(0, Math.min(100, 50 + 50 * (accCertain - accGuessed)))
    );
  }

  // tomorrow's queue: weak mastery + high exam weight first
  const tomorrowQueue = ws.concepts
    .filter((c) => c.mastery < 0.85 && c.status !== "locked")
    .sort((a, b) => {
      if (Math.abs(a.mastery - b.mastery) > 0.05) return a.mastery - b.mastery;
      return b.examWeight - a.examWeight;
    })
    .slice(0, 4)
    .map((c) => ({
      conceptId: c.id,
      title: c.title,
      reason: `${Math.round(c.mastery * 100)}% mastery · ${Math.round(
        c.examWeight * 100
      )}% exam weight`,
    }));

  return {
    conceptsCovered,
    timeSpentMin,
    accuracy,
    totalSteps: checkedTotal,
    errorTypes,
    betterMethodsLearned,
    remainingPct,
    hintTrend,
    calibrationScore,
    tomorrowQueue,
  };
}

export function ReportView() {
  const ws = useActiveWorkspace();
  const { setReport } = useMira();
  const [loading, setLoading] = useState(false);

  const data = useMemo(() => {
    if (!ws) return null;
    return computeReport(ws);
  }, [ws]);

  if (!ws || !data) return null;

  const today = todayISO();
  const hasTodayReport = ws.report?.date === today;
  const narrative = hasTodayReport ? ws.report?.narrative : undefined;
  const hasData = data.totalSteps > 0 || ws.attempts.length > 0;

  const buildReportInput = () => {
    return {
      subject: ws.name,
      conceptsCovered: data.conceptsCovered.map((c) => ({
        title: c.title,
        mastery: c.mastery,
      })),
      timeSpentMin: Math.round(data.timeSpentMin),
      accuracy: data.accuracy,
      errorTypes: data.errorTypes,
      betterMethodsLearned: data.betterMethodsLearned,
      remainingPct: data.remainingPct,
      hintTrend: data.hintTrend.map((h) => ({
        title: h.title,
        fullReveals: h.fullReveals,
        hints: h.hints,
      })),
      calibrationScore: data.calibrationScore,
      tomorrowQueue: data.tomorrowQueue.map((q) => ({
        title: q.title,
        reason: q.reason,
      })),
    };
  };

  const handleGenerateNarrative = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildReportInput()),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Report generation failed");

      // map tomorrowQueue titles back to concept ids
      const titleToId = new Map(ws.concepts.map((c) => [c.title, c.id]));
      const resolvedQueue = (json.tomorrowQueue as { title: string; reason: string }[])
        .map((q) => ({
          conceptId: titleToId.get(q.title) ?? q.title,
          reason: q.reason,
        }));

      const report: DailyReport = {
        date: today,
        conceptsCovered: data.conceptsCovered.map((c) => c.id),
        timeSpentMin: Math.round(data.timeSpentMin),
        accuracy: data.accuracy,
        errorTypes: data.errorTypes,
        betterMethodsLearned: data.betterMethodsLearned,
        remainingPct: data.remainingPct,
        hintTrend: data.hintTrend.map((h) => ({
          conceptId: h.conceptId,
          fullReveals: h.fullReveals,
          hints: h.hints,
        })),
        calibrationScore: data.calibrationScore,
        tomorrowQueue: resolvedQueue,
        narrative: json.narrative,
      };
      setReport(ws.id, report);
      toast.success("Today's narrative is ready.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Report generation failed.");
    } finally {
      setLoading(false);
    }
  };

  const errorData = ERROR_ORDER.map((k) => ({
    key: k,
    label: ERROR_META[k].label,
    count: data.errorTypes[k] || 0,
    color: ERROR_META[k].color,
  })).filter((d) => d.count > 0);

  return (
    <div className="flex-1 overflow-y-auto scroll-fancy">
      <div className="max-w-5xl mx-auto px-6 sm:px-8 py-6 sm:py-8">
        {/* header */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6"
        >
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <span className="size-1.5 rounded-full bg-primary animate-soft-pulse" />
              <span>Daily report · {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</span>
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl">Today's report.</h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-xl">
              Honest, specific, cheap — built from the data you already have. No vanity metrics.
            </p>
          </div>
          <Button
            onClick={handleGenerateNarrative}
            disabled={loading}
            variant={narrative ? "outline" : "default"}
            className="gap-1.5 shrink-0"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : narrative ? (
              <RotateCcw className="size-4" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {narrative ? "Regenerate narrative" : "Generate narrative"}
          </Button>
        </motion.div>

        {/* metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <MetricCard
            icon={<Clock className="size-4" />}
            label="Time spent"
            value={formatTime(data.timeSpentMin)}
            sub={hasData ? `${ws.attempts.length} attempt${ws.attempts.length === 1 ? "" : "s"}` : "no attempts yet"}
            tone="primary"
          />
          <MetricCard
            icon={<Target className="size-4" />}
            label="Step accuracy"
            value={data.totalSteps > 0 ? `${Math.round(data.accuracy * 100)}%` : "—"}
            sub={data.totalSteps > 0 ? `${data.totalSteps} checked step${data.totalSteps === 1 ? "" : "s"}` : "no steps checked"}
            tone="emerald"
          />
          <MetricCard
            icon={<Layers className="size-4" />}
            label="Syllabus remaining"
            value={`${data.remainingPct}%`}
            sub={`${Math.round(ws.syllabusProgress * 100)}% covered`}
            tone="amber"
          />
          <MetricCard
            icon={<Gauge className="size-4" />}
            label="Calibration"
            value={`${data.calibrationScore}`}
            sub="confidence vs correctness"
            tone="rose"
          />
        </div>

        {/* error taxonomy + hint trend */}
        <div className="grid lg:grid-cols-5 gap-5 mb-6">
          {/* error taxonomy chart */}
          <Card className="lg:col-span-3 p-5">
            <div className="flex items-start justify-between mb-1">
              <div>
                <h3 className="font-serif text-lg">Error taxonomy</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Two students at 60% accuracy can have completely different problems.
                </p>
              </div>
            </div>
            {errorData.length === 0 ? (
              <div className="h-[220px] flex flex-col items-center justify-center text-center text-sm text-muted-foreground gap-2">
                <AlertTriangle className="size-5 opacity-40" />
                <p>No errors logged yet. Either you're careful — or no steps have been checked.</p>
              </div>
            ) : (
              <div className="mt-4">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={errorData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={64}>
                      {errorData.map((d) => (
                        <Cell key={d.key} fill={d.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* hint trend */}
          <Card className="lg:col-span-2 p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-serif text-lg">Hint trend</h3>
                <p className="text-xs text-muted-foreground mt-0.5">per concept</p>
              </div>
              <Lightbulb className="size-4 text-amber-500" />
            </div>
            {data.hintTrend.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No hints requested yet. Asking for a hint isn't failure — it's data.
              </div>
            ) : (
              <div className="space-y-2">
                {data.hintTrend.map((h) => (
                  <div
                    key={h.conceptId}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    <span className="text-sm truncate">{h.title}</span>
                    <div className="flex items-center gap-3 text-xs shrink-0">
                      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <Lightbulb className="size-3" />
                        <span className="tabular-nums">{h.hints}</span>
                      </span>
                      <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                        <TrendingDown className="size-3" />
                        <span className="tabular-nums">{h.fullReveals}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
              <strong className="text-foreground">The real signal:</strong> needing fewer full reveals over time is the actual "is this sticking" signal — flat accuracy doesn't show it.
            </div>
          </Card>
        </div>

        {/* tomorrow's queue */}
        <Card className="p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-serif text-lg">Tomorrow's queue</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Weak mastery first, weighted by exam frequency.
              </p>
            </div>
            <Badge variant="secondary">{data.tomorrowQueue.length}</Badge>
          </div>
          {data.tomorrowQueue.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No weak concepts to queue — either you're ahead, or there's no syllabus mapped yet.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {data.tomorrowQueue.map((q, i) => (
                <motion.div
                  key={q.conceptId}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3 rounded-md border px-3 py-2.5"
                >
                  <div className="size-6 rounded-md bg-primary/10 text-primary grid place-items-center text-xs font-mono tabular-nums shrink-0">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{q.title}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{q.reason}</div>
                  </div>
                  <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
                </motion.div>
              ))}
            </div>
          )}
        </Card>

        {/* narrative */}
        <Card className={cn("p-5", loading && "glow-ring")}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-serif text-lg">Prism's narrative</h3>
            {narrative && (
              <Badge variant="outline" className="gap-1 text-[11px]">
                <Sparkles className="size-3" /> {hasTodayReport ? "Today" : "Saved"}
              </Badge>
            )}
          </div>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="size-5 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground animate-soft-pulse">
                Prism is writing your honest narrative…
              </p>
            </div>
          ) : narrative ? (
            <div className="rounded-lg border bg-muted/30 p-4 animate-step-in">
              <Markdown>{narrative}</Markdown>
            </div>
          ) : (
            <div className="py-8 text-center">
              <Sparkles className="size-5 mx-auto mb-2 text-primary/60" />
              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                Prism will turn today's data into a 90-word honest narrative — what stuck, what cost marks, and what to do tomorrow.
              </p>
              <Button
                onClick={handleGenerateNarrative}
                disabled={loading}
                className="mt-4 gap-1.5"
                size="sm"
              >
                <Sparkles className="size-4" /> Generate narrative
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "primary" | "emerald" | "amber" | "rose";
}) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  };
  return (
    <Card className="p-4">
      <div className={cn("size-8 rounded-lg grid place-items-center mb-2", tones[tone])}>
        {icon}
      </div>
      <div className="text-2xl font-serif tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      <div className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</div>
    </Card>
  );
}
