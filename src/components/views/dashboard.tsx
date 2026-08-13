"use client";

import { useMira } from "@/lib/store";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";
import {
  BookOpen,
  Plus,
  ArrowRight,
  Target,
  TrendingUp,
  Clock,
  Gauge,
  Sparkles,
  Stethoscope,
  FileBarChart,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function DashboardView() {
  const { workspaces, openWorkspace, setView } = useMira();
  const { data: session } = useSession();
  const user = session?.user as
    | { name?: string | null; email?: string | null; course?: string | null }
    | undefined;
  const firstName = user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "there";

  const primary = workspaces[0];
  const totalConcepts = workspaces.reduce((s, w) => s + w.concepts.length, 0);
  const mastered = workspaces.reduce(
    (s, w) => s + w.concepts.filter((c) => c.status === "mastered").length,
    0
  );
  const allSteps = workspaces.flatMap((workspace) =>
    workspace.attempts.flatMap((attempt) => attempt.steps)
  );
  const checkedSteps = allSteps.filter((step) => step.checkedAt);
  const avgAccuracy = checkedSteps.length
    ? checkedSteps.filter((step) => step.correct).length / checkedSteps.length
    : 0;
  const calibratedSteps = checkedSteps.filter((step) => step.confidence);
  const calibration = calibratedSteps.length
    ? Math.round(
        (calibratedSteps.filter((step) =>
          step.confidence === "certain" ? step.correct : step.confidence === "guessed" ? !step.correct : true
        ).length /
          calibratedSteps.length) *
          100
      )
    : 0;
  const coverage =
    workspaces.length > 0
      ? Math.round(
          (workspaces.reduce((s, w) => s + w.syllabusProgress, 0) / workspaces.length) * 100
        )
      : 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex-1 overflow-y-auto scroll-fancy">
      <div className="max-w-5xl mx-auto px-6 sm:px-8 py-8 sm:py-10">
        {/* hero */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <p className="text-sm text-muted-foreground">{greeting},</p>
          <h1 className="font-serif text-3xl sm:text-4xl mt-0.5">
            {firstName}.
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-lg">
            {primary
              ? `Pick up where you left off in ${primary.name}, or take the diagnostic to place yourself accurately.`
              : "Create your first subject to begin."}
          </p>
        </motion.div>

        {/* continue card */}
        {primary && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mb-8"
          >
            <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/8 via-card to-card p-6">
              <div className="absolute -right-12 -top-12 size-48 rounded-full bg-primary/8 blur-2xl" />
              <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <Badge variant="secondary" className="mb-2 gap-1">
                    <Sparkles className="size-3" /> Continue
                  </Badge>
                  <h2 className="font-serif text-2xl">{primary.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {primary.concepts.filter((c) => c.status === "in-progress").length} concepts
                    in progress · {Math.round(primary.syllabusProgress * 100)}% syllabus covered
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    onClick={() => openWorkspace(primary.id, "curriculum")}
                  >
                    Topic map
                  </Button>
                  <Button onClick={() => openWorkspace(primary.id, "practice")}>
                    Practice <ArrowRight className="size-4 ml-1" />
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* stats */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8"
        >
          <StatCard
            icon={<Layers className="size-4" />}
            label="Concepts mapped"
            value={`${totalConcepts}`}
            sub={`${mastered} mastered`}
            tone="primary"
          />
          <StatCard
            icon={<Target className="size-4" />}
            label="Syllabus coverage"
            value={`${coverage}%`}
            sub="across all subjects"
            tone="emerald"
          />
          <StatCard
            icon={<TrendingUp className="size-4" />}
            label="Step accuracy"
            value={`${Math.round(avgAccuracy * 100)}%`}
            sub="last 7 days"
            tone="amber"
          />
          <StatCard
            icon={<Gauge className="size-4" />}
            label="Calibration"
            value={`${calibration}`}
            sub="confidence vs correctness"
            tone="rose"
          />
        </motion.div>

        {/* subjects */}
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-serif text-xl">Your subjects</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => document.querySelector<HTMLButtonElement>("[data-new-subject]")?.click()}
          >
            <Plus className="size-4 mr-1" /> New
          </Button>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-10">
          {workspaces.map((w, i) => (
            <motion.div
              key={w.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 + i * 0.04 }}
            >
              <Card
                className="p-5 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer group"
                onClick={() => openWorkspace(w.id, "practice")}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                      <BookOpen className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{w.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {w.resources.length} sources · {w.concepts.length} concepts
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                    <span>Coverage</span>
                    <span>{Math.round(w.syllabusProgress * 100)}%</span>
                  </div>
                  <Progress value={w.syllabusProgress * 100} className="h-1.5" />
                </div>
                {w.concepts.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {w.concepts.slice(0, 3).map((c) => (
                      <Badge key={c.id} variant="secondary" className="text-[10px] font-normal">
                        {c.title}
                      </Badge>
                    ))}
                    {w.concepts.length > 3 && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        +{w.concepts.length - 3}
                      </Badge>
                    )}
                  </div>
                )}
              </Card>
            </motion.div>
          ))}

          {/* new subject ghost card */}
          <button
            onClick={() => document.querySelector<HTMLButtonElement>("[data-new-subject]")?.click()}
            className="border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors min-h-[140px]"
          >
            <Plus className="size-6" />
            <span className="text-sm">New subject</span>
          </button>
        </div>

        {/* quick actions */}
        <h3 className="font-serif text-xl mb-3">Quick actions</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          <QuickAction
            icon={<Stethoscope className="size-4" />}
            title="Placement check"
            desc="10 adaptive questions to place you accurately."
            onClick={() => primary && openWorkspace(primary.id, "practice")}
          />
          <QuickAction
            icon={<FileBarChart className="size-4" />}
            title="Today's report"
            desc="Concepts, accuracy, hint trend, calibration."
            onClick={() => primary && openWorkspace(primary.id, "report")}
          />
          <QuickAction
            icon={<Clock className="size-4" />}
            title="Plan my week"
            desc="Hours-per-day → exam-weighted schedule."
            onClick={() => primary && openWorkspace(primary.id, "curriculum")}
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({
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

function QuickAction({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <Card
      className="p-4 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer group"
      onClick={onClick}
    >
      <div className="size-8 rounded-lg bg-muted grid place-items-center mb-2 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
        {icon}
      </div>
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
    </Card>
  );
}
