"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileUp,
  Loader2,
  FileText,
  BookOpen,
  ListChecks,
  FileSearch,
  FileCheck2,
  AlertTriangle,
  EyeOff,
  Trash2,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { useActiveWorkspace, useMira } from "@/lib/store";
import type { Resource, ResourceKind, ResourceStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const KIND_META: Record<
  ResourceKind,
  { label: string; icon: React.ReactNode }
> = {
  notes: { label: "Notes", icon: <FileText className="size-3.5" /> },
  textbook: { label: "Textbook", icon: <BookOpen className="size-3.5" /> },
  "question-bank": { label: "Question bank", icon: <ListChecks className="size-3.5" /> },
  "past-paper": { label: "Past paper", icon: <FileSearch className="size-3.5" /> },
  syllabus: { label: "Syllabus", icon: <FileCheck2 className="size-3.5" /> },
  photo: { label: "Photo", icon: <ImageIcon className="size-3.5" /> },
};

const STATUS_META: Record<
  ResourceStatus,
  { label: string; className: string; dot: string }
> = {
  parsing: {
    label: "Parsing",
    className: "border-warning/50 text-warning-foreground bg-warning/15",
    dot: "bg-warning animate-soft-pulse",
  },
  parsed: {
    label: "Parsed",
    className: "border-primary/40 text-primary bg-primary/10",
    dot: "bg-primary",
  },
  "ocr-low": {
    label: "OCR low",
    className: "border-warning/50 text-warning-foreground bg-warning/15",
    dot: "bg-warning",
  },
  gap: {
    label: "Gap",
    className: "border-destructive/50 text-destructive bg-destructive/10",
    dot: "bg-destructive",
  },
};

// Track resources the user has dismissed the warning for.
const dismissed = new Set<string>();

// ─────────────────────────────────────────────────────────────────────────────
// Inference (kind is also inferred server-side, but we use it for optimistic UI)
// ─────────────────────────────────────────────────────────────────────────────

function inferKind(name: string): ResourceKind {
  const lower = name.toLowerCase();
  if (/\.(png|jpe?g|heic|webp|gif|bmp|tiff?)$/.test(lower)) return "photo";
  if (/syllabus/.test(lower)) return "syllabus";
  if (/(question|qb|bank|practice|exercise)/.test(lower)) return "question-bank";
  if (/(paper|exam|test|may|nov|2020|2021|2022|2023|2024|2025)/.test(lower)) return "past-paper";
  if (/\.pdf$/.test(lower)) return "textbook";
  return "notes";
}

function formatSize(kb?: number): string {
  if (!kb && kb !== 0) return "";
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// View
// ─────────────────────────────────────────────────────────────────────────────

export function ResourcesView() {
  const ws = useActiveWorkspace();
  const { upsertResource, removeResource, setTab } = useMira();
  const [dragging, setDragging] = React.useState(false);
  const [showExplainer, setShowExplainer] = React.useState(false);
  const [remapping, setRemapping] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [, force] = React.useReducer((x) => x + 1, 0); // re-render on dismiss changes

  if (!ws) return null;

  // REAL upload: multipart POST → server saves the file, extracts text
  // (PDF via pdf-parse, images via vision OCR), and returns the final resource.
  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    toast.info(`Prism is reading ${arr.length} file${arr.length > 1 ? "s" : ""}…`);

    for (const file of arr) {
      const kind = inferKind(file.name);
      const sizeKb = Math.max(1, Math.round(file.size / 1024));
      // Optimistic "parsing" placeholder keyed by a temp id.
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      upsertResource(ws!.id, {
        id: tempId,
        name: file.name,
        kind,
        status: "parsing",
        sizeKb,
        uploadedAt: Date.now(),
      });

      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`/api/workspaces/${ws!.id}/resources`, {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Upload failed");
        // Replace the temp placeholder with the real, extracted resource.
        // Remove the temp first, then upsert the real one.
        removeResource(ws!.id, tempId);
        upsertResource(ws!.id, data.resource);
        if (data.resource.status === "gap") {
          toast.warning(`Prism flagged a gap in "${file.name}".`);
        } else if (data.resource.status === "ocr-low") {
          toast.warning(`"${file.name}" — OCR confidence is low.`);
        } else {
          toast.success(
            `"${file.name}" parsed${data.resource.pages ? ` — ${data.resource.pages} pages indexed` : ""}.`
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Upload failed";
        removeResource(ws!.id, tempId);
        toast.error(`"${file.name}" failed: ${msg}`);
      }
    }
  }

  const resources = ws.resources;
  const sorted = [...resources].sort((a, b) => b.uploadedAt - a.uploadedAt);
  const hasGap = resources.some((r) => r.status === "gap" && !dismissed.has(r.id));
  const hasOcrLow = resources.some((r) => r.status === "ocr-low" && !dismissed.has(r.id));

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 sm:px-8 pt-4 pb-3 border-b">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <h2 className="font-serif text-lg leading-none">Sources</h2>
          <span className="text-muted-foreground">
            <span className="text-foreground font-medium">{resources.length}</span> file
            {resources.length !== 1 ? "s" : ""}
          </span>
          {resources.length > 0 && (
            <span className="text-muted-foreground">
              <span className="text-primary font-medium">
                {resources.filter((r) => r.status === "parsed").length}
              </span>{" "}
              parsed
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={remapping}
          onClick={async () => {
            if (remapping) return;
            setRemapping(true);
            toast.info("Prism is reading every file and rebuilding the topic map…");
            try {
              const res = await fetch(`/api/workspaces/${ws.id}/curriculum`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject: ws.name }),
              });
              const data = await res.json();
              if (!data.ok) throw new Error(data.error || "Mapping failed");
              useMira.getState().setConcepts(ws.id, data.concepts);
              toast.success(
                `Topic map rebuilt from ${ws.resources.length} source${ws.resources.length !== 1 ? "s" : ""} — ${data.concepts.length} concepts.`
              );
              setTab("curriculum");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Re-map failed");
            } finally {
              setRemapping(false);
            }
          }}
          className="gap-1.5"
        >
          <Sparkles className="size-3.5" />
          {remapping ? "Mapping…" : "Re-map curriculum"}
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="px-6 sm:px-8 py-5 space-y-5 max-w-4xl">
          {/* Insight banner */}
          {(hasGap || hasOcrLow) && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground flex items-start gap-2">
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
              <span>
                {hasGap && hasOcrLow
                  ? "Prism flagged a gap and a low-OCR file. Resolve them so the topic map is accurate."
                  : hasGap
                  ? "Prism noticed a gap in your uploaded material. The curriculum may be missing a unit."
                  : "One file has low OCR confidence. Re-upload a clearer scan or proceed anyway."}
              </span>
            </div>
          )}

          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "relative rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all",
              dragging
                ? "border-primary bg-primary/8 scale-[1.01]"
                : "border-border hover:border-primary/50 hover:bg-accent/40"
            )}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="mx-auto size-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <FileUp className="size-6 text-primary" />
            </div>
            <p className="font-serif text-base">Drop files here, or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              Drag notes, PDFs, question banks, past papers, syllabus, or a photo of your
              teacher's handwriting. PDF, text, Markdown, CSV, JSON, LaTeX, and images are supported.
            </p>
          </div>

          {/* How ingestion works */}
          <Collapsible open={showExplainer} onOpenChange={setShowExplainer}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {showExplainer ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
                <Info className="size-3.5" />
                How ingestion works
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 rounded-lg border bg-card/40 px-4 py-3 text-xs text-muted-foreground leading-relaxed space-y-1.5">
                <p>
                  <span className="text-foreground font-medium">Digital PDFs</span> → text layer
                  parsed with pdf-parse. <span className="text-foreground font-medium">Text & notes</span>{" "}
                  → read directly. <span className="text-foreground font-medium">Scans & photos of
                  handwriting</span> → transcribed by the vision model (OCR).
                </p>
                <p>
                  Extracted text is stored per-workspace and fed to the AI when it builds the topic
                  map — so exam weights come from <em>your actual past papers</em>, not guesswork.
                  Practice problems and theory answers are grounded in the same material.
                </p>
                <p className="italic">
                  This is a real pipeline: the file you drop is saved, read, and indexed on the
                  server.
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Resource list */}
          {sorted.length === 0 ? (
            <EmptyResources />
          ) : (
            <div className="space-y-2.5">
              <AnimatePresence initial={false}>
                {sorted.map((r) => (
                  <ResourceRow
                    key={r.id}
                    resource={r}
                    workspaceId={ws.id}
                    onRemoved={() => {
                      removeResource(ws.id, r.id);
                      dismissed.delete(r.id);
                      toast.success(`Removed "${r.name}".`);
                    }}
                    onProceed={() => {
                      dismissed.add(r.id);
                      force();
                    }}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Resource row
// ─────────────────────────────────────────────────────────────────────────────

function ResourceRow({
  resource,
  workspaceId,
  onRemoved,
  onProceed,
}: {
  resource: Resource;
  workspaceId: string;
  onRemoved: () => void;
  onProceed: () => void;
}) {
  const kind = KIND_META[resource.kind];
  const status = STATUS_META[resource.status];
  const isParsing = resource.status === "parsing";
  const isOcrLow = resource.status === "ocr-low";
  const isGap = resource.status === "gap";
  const isDismissed = dismissed.has(resource.id);
  const [reingesting, setReingesting] = React.useState(false);
  const isTemp = resource.id.startsWith("temp-");

  const handleRemove = async () => {
    // Optimistic remove from the client store.
    onRemoved();
    if (isTemp) return;
    try {
      await fetch(`/api/workspaces/${workspaceId}/resources/${resource.id}`, {
        method: "DELETE",
      });
    } catch {
      /* best-effort; the row is already gone from the UI */
    }
  };

  const handleReingest = async () => {
    if (isTemp) {
      toast.info("Drop the new file in the zone above.");
      return;
    }
    setReingesting(true);
    // Optimistically show parsing again.
    useMira
      .getState()
      .upsertResource(workspaceId, { ...resource, status: "parsing", note: "Re-parsing…" });
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/resources/${resource.id}`, {
        method: "PATCH",
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Re-ingest failed");
      useMira.getState().upsertResource(workspaceId, data.resource);
      toast.success(`"${resource.name}" re-parsed.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Re-ingest failed");
      // restore previous status
      useMira.getState().upsertResource(workspaceId, resource);
    } finally {
      setReingesting(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "rounded-xl border bg-card px-4 py-3",
        isDismissed && "opacity-60"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 size-9 rounded-lg bg-accent flex items-center justify-center text-muted-foreground shrink-0">
          {kind.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{resource.name}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] text-muted-foreground">
                <Badge variant="outline" className="text-[10px] gap-1">
                  {kind.icon}
                  {kind.label}
                </Badge>
                <Badge variant="outline" className={cn("text-[10px] gap-1", status.className)}>
                  <span className={cn("size-1.5 rounded-full", status.dot)} />
                  {status.label}
                </Badge>
                {resource.pages ? <span>· {resource.pages} pages</span> : null}
                {resource.sizeKb ? <span>· {formatSize(resource.sizeKb)}</span> : null}
                <span>· {relativeTime(resource.uploadedAt)}</span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {isOcrLow && !isDismissed && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onProceed}
                  className="h-7 text-[11px] gap-1 text-muted-foreground"
                >
                  <EyeOff className="size-3" />
                  Proceed anyway
                </Button>
              )}
              {(isOcrLow || isGap) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReingest}
                  disabled={reingesting}
                  className="h-7 text-[11px] gap-1 text-muted-foreground"
                >
                  <RefreshCw className={cn("size-3", reingesting && "animate-spin")} />
                  {reingesting ? "Re-parsing…" : "Re-parse"}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRemove}
                className="size-7 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>

          {/* Note — the human-facing status detail */}
          {isParsing ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin text-warning" />
              <span className="italic">Prism is reading this file…</span>
            </div>
          ) : (
            resource.note && (
              <div
                className={cn(
                  "mt-2 text-xs flex items-start gap-1.5",
                  isGap && !isDismissed
                    ? "text-destructive"
                    : isOcrLow && !isDismissed
                    ? "text-warning-foreground"
                    : "text-muted-foreground"
                )}
              >
                {(isGap || isOcrLow) && !isDismissed && (
                  <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                )}
                <span className={isDismissed ? "line-through" : ""}>{resource.note}</span>
                {isDismissed && (
                  <span className="italic text-muted-foreground/70">(dismissed)</span>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

function EmptyResources() {
  return (
    <div className="rounded-xl border border-dashed border-border py-10 text-center">
      <p className="font-serif text-lg">Nothing uploaded yet</p>
      <p className="text-sm text-muted-foreground mt-1">
        Don't leave a blank dashboard. Drop your first file above — Prism does the rest.
      </p>
    </div>
  );
}
