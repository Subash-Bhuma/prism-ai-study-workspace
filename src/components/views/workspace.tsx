"use client";

import { useMira, useActiveWorkspace } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  PenLine,
  GitBranch,
  FolderOpen,
  FileText,
  BarChart3,
  Stethoscope,
  CalendarDays,
} from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import type { WorkspaceTab } from "@/lib/types";
import { PracticeView } from "./practice-view";
import { CurriculumView } from "./curriculum-view";
import { ResourcesView } from "./resources-view";
import { TheoryView } from "./theory-view";
import { ReportView } from "./report-view";
import { DiagnosticView } from "./diagnostic-view";

const TABS: { id: WorkspaceTab; label: string; icon: React.ReactNode }[] = [
  { id: "practice", label: "Practice", icon: <PenLine className="size-4" /> },
  { id: "curriculum", label: "Topic map", icon: <GitBranch className="size-4" /> },
  { id: "resources", label: "Sources", icon: <FolderOpen className="size-4" /> },
  { id: "theory", label: "Theory", icon: <FileText className="size-4" /> },
  { id: "report", label: "Report", icon: <BarChart3 className="size-4" /> },
];

export function WorkspaceView() {
  const ws = useActiveWorkspace();
  const { tab, setTab } = useMira();
  const [diagOpen, setDiagOpen] = useState(false);

  if (!ws) return null;

  const examDays = ws.examDate
    ? Math.ceil(
        (new Date(ws.examDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    : null;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* header */}
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="px-6 sm:px-8 pt-4 pb-0">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="min-w-0">
              <h1 className="font-serif text-2xl leading-tight truncate">{ws.name}</h1>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span>{ws.concepts.length} concepts</span>
                <span className="size-1 rounded-full bg-muted-foreground/40" />
                <span>{ws.resources.length} sources</span>
                {ws.diagnostic && (
                  <>
                    <span className="size-1 rounded-full bg-muted-foreground/40" />
                    <span>placement: {ws.diagnostic.correct}/{ws.diagnostic.total}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {examDays !== null && (
                <Badge variant="outline" className="gap-1">
                  <CalendarDays className="size-3" />
                  {examDays > 0 ? `${examDays}d to exam` : "exam today"}
                </Badge>
              )}
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setDiagOpen(true)}>
                <Stethoscope className="size-3.5" /> Placement
              </Button>
            </div>
          </div>

          {/* tabs */}
          <div className="flex items-center gap-1 -mb-px overflow-x-auto scroll-fancy">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative flex items-center gap-1.5 px-3.5 py-2.5 text-sm transition-colors whitespace-nowrap border-b-2",
                  tab === t.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t.icon}
                {t.label}
                {tab === t.id && (
                  <motion.div
                    layoutId="tab-underline"
                    className="absolute inset-x-0 -bottom-px h-0.5 bg-primary"
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* tab content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {tab === "practice" && <PracticeView />}
        {tab === "curriculum" && <CurriculumView />}
        {tab === "resources" && <ResourcesView />}
        {tab === "theory" && <TheoryView />}
        {tab === "report" && <ReportView />}
      </div>

      {/* Placement check overlay */}
      <DiagnosticView
        open={diagOpen}
        onOpenChange={setDiagOpen}
        onDone={() => setTab("curriculum")}
      />
    </div>
  );
}
