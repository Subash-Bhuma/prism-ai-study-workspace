"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch,
  Sparkles,
  Loader2,
  Lock,
  ArrowRight,
  Lightbulb,
  Eye,
  RotateCcw,
  AlertTriangle,
  PenLine,
} from "lucide-react";
import { toast } from "sonner";
import { useActiveWorkspace, useMira } from "@/lib/store";
import type { Concept } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { TopicMap } from "@/components/topic-map";

const STATUS_BADGE: Record<
  Concept["status"],
  { label: string; className: string }
> = {
  locked: {
    label: "Locked",
    className: "border-muted-foreground/40 text-muted-foreground",
  },
  available: {
    label: "Available",
    className: "border-primary/40 text-primary",
  },
  "in-progress": {
    label: "In progress",
    className: "border-warning/50 text-warning-foreground bg-warning/15",
  },
  mastered: {
    label: "Mastered",
    className: "border-primary/50 text-primary-foreground bg-primary",
  },
};

export function CurriculumView() {
  const ws = useActiveWorkspace();
  const {
    activeConceptId,
    setActiveConcept,
    setConcepts,
    setTab,
  } = useMira();

  const [mapping, setMapping] = React.useState(false);

  if (!ws) return null;

  const concepts = ws.concepts;
  const hasGapResource = ws.resources.some((r) => r.status === "gap");

  // Pick default active concept if none selected
  const effectiveActiveId =
    activeConceptId && concepts.find((c) => c.id === activeConceptId)
      ? activeConceptId
      : concepts.find((c) => c.status === "in-progress")?.id ??
        concepts.find((c) => c.status === "available")?.id ??
        concepts[0]?.id ??
        null;

  const activeConcept = effectiveActiveId
    ? concepts.find((c) => c.id === effectiveActiveId) ?? null
    : null;

  const coveragePct = Math.round(ws.syllabusProgress * 100);

  async function handleRemap() {
    if (!ws) return;
    if (ws.resources.length === 0) {
      toast.error("Upload some sources first — Prism needs material to read.");
      return;
    }
    setMapping(true);
    try {
      const res = await fetch(`/api/workspaces/${ws.id}/curriculum`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: ws.name }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to map curriculum");
      setConcepts(ws.id, data.concepts as Concept[]);
      toast.success(
        `Prism read your sources and mapped ${data.concepts.length} concepts — exam weights from your past papers.`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error(`Couldn't map curriculum: ${msg}`);
    } finally {
      setMapping(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 sm:px-8 pt-4 pb-3 border-b">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <h2 className="font-serif text-lg leading-none">Topic map</h2>
          <span className="text-muted-foreground">
            Concepts: <span className="text-foreground font-medium">{concepts.length}</span>
          </span>
          <span className="text-muted-foreground">
            Syllabus coverage:{" "}
            <span className="text-foreground font-medium">{coveragePct}%</span>
          </span>
          {hasGapResource && (
            <Badge
              variant="outline"
              className="border-destructive/40 text-destructive gap-1"
            >
              <AlertTriangle className="size-3" />
              Gap in sources
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRemap}
          disabled={mapping}
          className="gap-1.5"
        >
          {mapping ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {mapping ? "Reading your material…" : "Re-map curriculum from sources"}
        </Button>
      </div>

      {hasGapResource && (
        <div className="mx-6 sm:mx-8 mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive/90 flex items-center gap-2">
          <AlertTriangle className="size-3.5 shrink-0" />
          Prism noticed a gap in your uploaded material — see{" "}
          <button
            className="underline underline-offset-2 font-medium"
            onClick={() => setTab("resources")}
          >
            Sources
          </button>
          .
        </div>
      )}

      {concepts.length === 0 ? (
        <EmptyState onBuild={handleRemap} mapping={mapping} />
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-0">
          {/* Topic map (hero) */}
          <div className="relative min-h-[460px] lg:min-h-0 p-4 sm:p-6">
            <TopicMap
              concepts={concepts}
              activeId={effectiveActiveId ?? undefined}
              onSelect={(id) => setActiveConcept(id)}
            />
          </div>

          {/* Side panel */}
          <aside className="border-t lg:border-t-0 lg:border-l bg-card/40">
            <ScrollArea className="h-full">
              <AnimatePresence mode="wait">
                {activeConcept ? (
                  <motion.div
                    key={activeConcept.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className="p-5 space-y-4"
                  >
                    <ConceptDetail
                      concept={activeConcept}
                      allConcepts={concepts}
                      onPractice={() => {
                        setActiveConcept(activeConcept.id);
                        setTab("practice");
                      }}
                    />
                  </motion.div>
                ) : (
                  <div className="p-6 text-sm text-muted-foreground">
                    Select a concept to see its details.
                  </div>
                )}
              </AnimatePresence>
            </ScrollArea>
          </aside>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({
  onBuild,
  mapping,
}: {
  onBuild: () => void;
  mapping: boolean;
}) {
  return (
    <div className="flex-1 min-h-0 flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-5">
        <div className="mx-auto size-16 rounded-full bg-primary/10 flex items-center justify-center">
          <GitBranch className="size-7 text-primary" />
        </div>
        <div>
          <h3 className="font-serif text-2xl">Build your topic map</h3>
          <p className="text-sm text-muted-foreground mt-1.5">
            Prism reads your uploaded notes, textbook, question banks and past papers, then
            lays out a dependency graph weighted by exam frequency. This is the backbone of
            everything else you'll do here.
          </p>
        </div>
        <Button onClick={onBuild} disabled={mapping} size="lg" className="gap-2">
          {mapping ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Prism is reading your material…
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              Build the topic map
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground">
          Takes ~20 seconds. You can re-map any time you add new sources.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Concept detail panel
// ─────────────────────────────────────────────────────────────────────────────

function ConceptDetail({
  concept,
  allConcepts,
  onPractice,
}: {
  concept: Concept;
  allConcepts: Concept[];
  onPractice: () => void;
}) {
  const sb = STATUS_BADGE[concept.status];
  const depConcepts = concept.dependencies
    .map((id) => allConcepts.find((c) => c.id === id))
    .filter((d): d is Concept => Boolean(d));

  const stuckDeps = depConcepts.filter((d) => d.status !== "mastered");

  return (
    <>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            {concept.unit}
          </Badge>
          <Badge variant="outline" className={cn("text-[10px]", sb.className)}>
            {sb.label}
          </Badge>
        </div>
        <h3 className="font-serif text-xl leading-tight">{concept.title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{concept.description}</p>
      </div>

      <Separator />

      {/* Exam weight */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Exam weight
          </span>
          <span className="text-sm font-semibold">{Math.round(concept.examWeight * 100)}%</span>
        </div>
        <Progress value={concept.examWeight * 100} className="h-1.5" />
        <p className="text-[11px] text-muted-foreground italic">
          Derived from past-paper frequency.
        </p>
      </div>

      {/* Mastery */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Mastery
          </span>
          <span className="text-sm font-semibold">{Math.round(concept.mastery * 100)}%</span>
        </div>
        <Progress value={concept.mastery * 100} className="h-1.5" />
      </div>

      <Separator />

      {/* Dependencies */}
      <div className="space-y-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Dependencies
        </span>
        {depConcepts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No prerequisites — a root concept.</p>
        ) : (
          <ul className="space-y-1.5">
            {depConcepts.map((d) => {
              const blocked = d.status !== "mastered";
              return (
                <li
                  key={d.id}
                  className={cn(
                    "flex items-center gap-2 text-sm rounded-md px-2 py-1.5 border",
                    blocked
                      ? "border-warning/40 bg-warning/10 text-warning-foreground"
                      : "border-emerald/30 bg-primary/5"
                  )}
                >
                  {blocked ? (
                    <Lock className="size-3.5 text-warning shrink-0" />
                  ) : (
                    <span className="size-1.5 rounded-full bg-primary shrink-0" />
                  )}
                  <span className="flex-1 truncate">{d.title}</span>
                  {blocked && (
                    <span className="text-[10px] text-warning-foreground/80 shrink-0">
                      unlock by mastering {d.title.split(" ")[0]}
                    </span>
                  )}
                </li>
              );
            })}
            {stuckDeps.length > 0 && (
              <li className="text-[11px] text-muted-foreground italic pt-1">
                {concept.status === "locked"
                  ? "Master these first to unlock this concept."
                  : "Polish these to make this concept stick."}
              </li>
            )}
          </ul>
        )}
      </div>

      <Separator />

      {/* Stats */}
      <div className="space-y-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Activity
        </span>
        <div className="grid grid-cols-3 gap-2">
          <Stat icon={<RotateCcw className="size-3.5" />} label="Attempts" value={concept.attempts} />
          <Stat icon={<Lightbulb className="size-3.5" />} label="Hints" value={concept.hintsUsed} />
          <Stat icon={<Eye className="size-3.5" />} label="Full reveals" value={concept.fullReveals} />
        </div>
        <p className="text-[11px] text-muted-foreground italic pt-0.5">
          Fewer full reveals over time = it's sticking.
        </p>
      </div>

      <Button onClick={onPractice} className="w-full gap-2" size="sm">
        <PenLine className="size-4" />
        Practice this concept
        <ArrowRight className="size-3.5 ml-auto" />
      </Button>
    </>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border bg-background/60 px-2.5 py-2 flex flex-col items-center text-center gap-0.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-base font-semibold leading-none">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}
