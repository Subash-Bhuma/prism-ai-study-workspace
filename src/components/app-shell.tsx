"use client";

import { useMira, useActiveWorkspace } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Plus,
  Sun,
  Moon,
  ArrowLeft,
  Sparkles,
  FileText,
  RotateCcw,
  LayoutDashboard,
  GraduationCap,
  User as UserIcon,
  Settings as SettingsIcon,
  LogOut,
  Loader2,
} from "lucide-react";
import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { signOut } from "next-auth/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { ResourceStatus } from "@/lib/types";

const statusColor: Record<ResourceStatus, string> = {
  parsed: "bg-emerald-500",
  parsing: "bg-amber-500 animate-soft-pulse",
  "ocr-low": "bg-amber-500",
  gap: "bg-rose-500",
};

interface SessionUser {
  name?: string | null;
  email?: string | null;
  course?: string | null;
  semester?: string | null;
  avatarSeed?: string | null;
}

interface AppShellProps {
  children: React.ReactNode;
  session: { user?: SessionUser } | null;
}

export function AppShell({ children, session }: AppShellProps) {
  const ws = useActiveWorkspace();
  const { workspaces, openWorkspace, setView, createWorkspace, resetAll, view } =
    useMira();
  const { theme, setTheme } = useTheme();
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [creating, setCreating] = useState(false);

  const sUser = session?.user;
  const displayName = sUser?.name ?? sUser?.email?.split("@")[0] ?? "Student";
  const displaySub = sUser?.semester ?? sUser?.email ?? "";
  const avatarSeed = (sUser?.avatarSeed ?? displayName).toString();

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Give your subject a name");
      return;
    }
    setCreating(true);
    const subjectName = name.trim();
    const id = await createWorkspace(subjectName, examDate || null);
    setCreating(false);
    if (!id) {
      toast.error("Prism couldn't create that subject. Try again.");
      return;
    }
    setNewOpen(false);
    setName("");
    setExamDate("");
    openWorkspace(id, "resources");
    toast.success(`"${subjectName}" created - upload material to begin`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="md:hidden sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/95 px-3 backdrop-blur">
        <button
          onClick={() => setView("dashboard")}
          className="flex min-w-0 items-center gap-2"
          title="Prism dashboard"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          <span className="truncate font-serif text-lg">{ws?.name ?? "Prism"}</span>
        </button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setView("dashboard")} title="Dashboard">
            <LayoutDashboard className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setNewOpen(true)} title="New subject">
            <Plus className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setView("profile")} title="Profile">
            <UserIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={theme === "dark" ? "Light theme" : "Dark theme"}
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="hidden md:flex w-[290px] shrink-0 flex-col border-r bg-sidebar/60 backdrop-blur-sm">
          <div className="px-5 pt-5 pb-3">
            <button
              onClick={() => setView("dashboard")}
              className="flex items-center gap-2 group"
            >
              <div className="size-8 rounded-lg bg-primary text-primary-foreground grid place-items-center shadow-sm">
                <Sparkles className="size-4" />
              </div>
              <div className="text-left leading-tight">
                <div className="font-serif text-lg leading-none">Prism</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  study companion
                </div>
              </div>
            </button>
          </div>

          <div className="px-3 pb-3">
            <Button
              data-new-subject
              onClick={() => setNewOpen(true)}
              variant="outline"
              className="w-full justify-start gap-2 border-dashed"
            >
              <Plus className="size-4" /> New subject
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto scroll-fancy px-2">
            {ws ? (
              /* active workspace context */
              <div className="space-y-4">
                <button
                  onClick={() => setView("dashboard")}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 transition-colors"
                >
                  <ArrowLeft className="size-3.5" /> All subjects
                </button>

                <div className="px-2">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="size-4 text-primary" />
                    <h2 className="font-serif text-base leading-tight">{ws.name}</h2>
                  </div>
                  {ws.examDate && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Exam · {new Date(ws.examDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                      <span>Syllabus coverage</span>
                      <span>{Math.round(ws.syllabusProgress * 100)}%</span>
                    </div>
                    <Progress value={ws.syllabusProgress * 100} className="h-1.5" />
                  </div>
                </div>

                <div className="px-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
                    Sources ({ws.resources.length})
                  </div>
                  <div className="space-y-0.5">
                    {ws.resources.length === 0 && (
                      <p className="text-xs text-muted-foreground italic px-1">
                        No material uploaded yet.
                      </p>
                    )}
                    {ws.resources.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => openWorkspace(ws.id, "resources")}
                        className="w-full flex items-start gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-sidebar-accent transition-colors"
                      >
                        <span
                          className={cn(
                            "mt-1 size-1.5 rounded-full shrink-0",
                            statusColor[r.status]
                          )}
                        />
                        <span className="min-w-0">
                          <span className="block text-xs truncate">{r.name}</span>
                          <span className="block text-[10px] text-muted-foreground capitalize">
                            {r.kind.replace("-", " ")}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="px-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
                    Concepts ({ws.concepts.length})
                  </div>
                  <div className="space-y-0.5">
                    {ws.concepts.slice(0, 8).map((c) => (
                      <button
                        key={c.id}
                        onClick={() => openWorkspace(ws.id, "curriculum")}
                        className="w-full flex items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-sidebar-accent transition-colors"
                      >
                        <span
                          className={cn(
                            "size-1.5 rounded-full shrink-0",
                            c.status === "mastered"
                              ? "bg-emerald-500"
                              : c.status === "in-progress"
                              ? "bg-amber-500"
                              : c.status === "locked"
                              ? "bg-muted-foreground/30"
                              : "bg-primary/50"
                          )}
                        />
                        <span className="text-xs truncate flex-1">{c.title}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {Math.round(c.mastery * 100)}%
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* dashboard: list all workspaces */
              <div className="space-y-1">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Your subjects
                </div>
                {workspaces.length === 0 && (
                  <p className="px-2 py-2 text-xs leading-relaxed text-muted-foreground">
                    No subjects yet.
                  </p>
                )}
                {workspaces.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => openWorkspace(w.id, "practice")}
                    className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-sidebar-accent transition-colors group"
                  >
                    <div className="size-8 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
                      <BookOpen className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{w.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {w.concepts.length} concepts · {w.resources.length} sources
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* footer */}
          <div className="border-t p-3 space-y-0.5">
            <button
              onClick={() => setView("dashboard")}
              className={cn(
                "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                view === "dashboard"
                  ? "bg-sidebar-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              )}
            >
              <LayoutDashboard className="size-3.5" /> Dashboard
            </button>
            <button
              onClick={() => setView("profile")}
              className={cn(
                "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                view === "profile"
                  ? "bg-sidebar-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              )}
            >
              <UserIcon className="size-3.5" /> Profile
            </button>
            <button
              onClick={() => setView("settings")}
              className={cn(
                "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                view === "settings"
                  ? "bg-sidebar-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              )}
            >
              <SettingsIcon className="size-3.5" /> Settings
            </button>
            <div className="flex items-center justify-between pt-0.5">
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
              >
                {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
                {theme === "dark" ? "Light" : "Dark"}
              </button>
              <button
                onClick={() => {
                  if (confirm("Delete all of your subject workspaces and study data?")) {
                    void resetAll().then(() => toast.success("Study data reset"));
                  }
                }}
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
                title="Delete all study data"
              >
                <RotateCcw className="size-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2 px-1 pt-2 mt-1 border-t">
              <div className="size-8 rounded-full bg-primary/15 text-primary grid place-items-center text-xs font-semibold shrink-0">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs truncate font-medium">{displayName}</div>
                <div className="text-[10px] text-muted-foreground truncate">{displaySub}</div>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="flex items-center justify-center size-7 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-destructive transition-colors shrink-0"
                title="Sign out"
              >
                <LogOut className="size-3.5" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 flex flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={ws ? ws.id + useMira.getState().tab : "no-ws"}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
              className="flex-1 min-h-0 flex flex-col"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* New subject dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a subject workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="subj-name">Subject name</Label>
              <Input
                id="subj-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Engineering Physics"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subj-exam">Target exam date (optional)</Label>
              <Input
                id="subj-exam"
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Plus className="size-4 mr-1" />}
              {creating ? "Creating" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
