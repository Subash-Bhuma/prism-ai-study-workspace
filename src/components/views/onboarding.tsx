"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight, Volume2, VolumeX, Check, PenLine, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function OnboardingView({
  email,
  initialName,
  onDone,
}: {
  email: string;
  initialName?: string | null;
  onDone: () => void;
}) {
  const { update: updateSession } = useSession();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName?.trim() || email.split("@")[0] || "");
  const [course, setCourse] = useState("");
  const [semester, setSemester] = useState("");
  const [examDate, setExamDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const next = () => {
    if (step === 0) {
      if (!name.trim()) return toast.error("What should Prism call you?");
      if (!course.trim()) return toast.error("Add your course so Prism can tailor things");
      setStep(1);
      return;
    }
    // Persist the profile to the database and mark onboarding complete.
    setSubmitting(true);
    fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        course: course.trim(),
        semester: semester.trim() || "Current semester",
        examDate: examDate || null,
        avatarSeed: name.trim(),
        onboarded: true,
      }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (!data.ok) throw new Error(data.error || "Couldn't save profile");
        // Refresh the session so `onboarded` flips to true.
        await updateSession({});
        toast.success("Welcome to Prism.");
        onDone();
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Couldn't save profile");
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-xl">
          {/* brand */}
          <div className="flex items-center gap-2 mb-10 justify-center">
            <div className="size-9 rounded-xl bg-primary text-primary-foreground grid place-items-center shadow-sm">
              <Sparkles className="size-4.5" />
            </div>
            <div className="font-serif text-2xl">Prism</div>
          </div>

          <AnimatePresence mode="wait">
            {step === 0 ? (
              <motion.div
                key="s0"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.3 }}
              >
                <div className="text-center mb-8">
                  <h1 className="font-serif text-3xl sm:text-4xl leading-tight">
                    Learn by doing.
                    <br />
                    <span className="text-primary">AI stays silent while you're right.</span>
                  </h1>
                  <p className="text-sm text-muted-foreground mt-3 max-w-md mx-auto">
                    Prism watches you solve, write and revise, and only steps in when you're
                    actually stuck. Let's set you up in two quick steps.
                  </p>
                </div>

                <div className="rounded-2xl border bg-card/70 backdrop-blur p-6 space-y-4 shadow-sm">
                  <div className="space-y-2">
                    <Label htmlFor="name">Your name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Aarav"
                      autoFocus
                    />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="course">Current course</Label>
                      <Input
                        id="course"
                        value={course}
                        onChange={(e) => setCourse(e.target.value)}
                        placeholder="B.Tech - Engineering Maths"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sem">Semester</Label>
                      <Input
                        id="sem"
                        value={semester}
                        onChange={(e) => setSemester(e.target.value)}
                        placeholder="Semester 4"
                      />
                    </div>
                  </div>
                  <Button onClick={next} className="w-full" size="lg">
                    Continue <ArrowRight className="size-4 ml-1" />
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="s1"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.3 }}
              >
                <div className="text-center mb-8">
                  <h1 className="font-serif text-3xl sm:text-4xl leading-tight">
                    One last thing.
                  </h1>
                  <p className="text-sm text-muted-foreground mt-3 max-w-md mx-auto">
                    An exam date helps Prism pace your plan. Skip it if you're not sure;
                    you can add it later.
                  </p>
                </div>

                <div className="rounded-2xl border bg-card/70 backdrop-blur p-6 space-y-5 shadow-sm">
                  <div className="space-y-2">
                    <Label htmlFor="exam">Target exam date (optional)</Label>
                    <Input
                      id="exam"
                      type="date"
                      value={examDate}
                      onChange={(e) => setExamDate(e.target.value)}
                    />
                  </div>

                  <div className="rounded-xl bg-muted/50 p-4 space-y-2.5">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      How Prism works
                    </div>
                    <div className="flex items-start gap-2.5">
                      <PenLine className="size-4 text-primary mt-0.5 shrink-0" />
                      <p className="text-sm">
                        You solve step by step on a math canvas. Prism checks each step
                        the moment you submit it.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <VolumeX className="size-4 text-emerald-500 mt-0.5 shrink-0" />
                      <p className="text-sm">
                        When your step is right, Prism stays <span className="ink-underline">silent</span>.
                        No nagging, no false praise.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <Volume2 className="size-4 text-amber-500 mt-0.5 shrink-0" />
                      <p className="text-sm">
                        When you're stuck, a hint ladder eases you forward: pointed question,
                        then concept, then partial step, then full solution.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setStep(0)} className="flex-1" disabled={submitting}>
                      Back
                    </Button>
                    <Button onClick={next} className="flex-1" size="lg" disabled={submitting}>
                      {submitting ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="size-4 mr-1" /> Enter Prism
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
