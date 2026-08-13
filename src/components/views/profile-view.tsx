"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";
import {
  Mail,
  User as UserIcon,
  GraduationCap,
  CalendarDays,
  Save,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

interface ProfileData {
  id: string;
  email: string;
  name: string | null;
  course: string | null;
  semester: string | null;
  examDate: string | null;
  avatarSeed: string;
  onboarded: boolean;
  createdAt: string;
}

export function ProfileView({
  session,
}: {
  session: { user?: { email?: string | null } } | null;
}) {
  const { update: updateSession } = useSession();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [course, setCourse] = useState("");
  const [semester, setSemester] = useState("");
  const [examDate, setExamDate] = useState("");

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setProfile(data.profile);
          setName(data.profile.name ?? "");
          setCourse(data.profile.course ?? "");
          setSemester(data.profile.semester ?? "");
          setExamDate(data.profile.examDate ?? "");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!name.trim()) return toast.error("Name can't be empty");
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          course: course.trim(),
          semester: semester.trim(),
          examDate: examDate || null,
          avatarSeed: name.trim(),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Save failed");
      setProfile(data.profile);
      await updateSession({});
      toast.success("Profile saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !profile) {
    return (
      <div className="flex-1 grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const memberSince = new Date(profile.createdAt).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex-1 overflow-y-auto scroll-fancy">
      <div className="max-w-2xl mx-auto px-6 sm:px-8 py-8 sm:py-10">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-serif text-3xl">Profile</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Prism uses this to tailor your plan and greet you. Everything is saved to your account.
          </p>
        </motion.div>

        {/* identity card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mt-6"
        >
          <Card className="p-5 flex items-center gap-4">
            <div className="size-16 rounded-2xl bg-primary/15 text-primary grid place-items-center text-2xl font-serif font-semibold shrink-0">
              {(name || profile.email).slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-serif text-xl truncate">{name || "Unnamed"}</div>
              <div className="text-sm text-muted-foreground truncate flex items-center gap-1.5">
                <Mail className="size-3.5" /> {profile.email}
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <ShieldCheck className="size-3" /> Member since {memberSince}
                </Badge>
                {profile.onboarded && (
                  <Badge variant="outline" className="gap-1 text-[10px] text-primary">
                    <Sparkles className="size-3" /> Onboarded
                  </Badge>
                )}
              </div>
            </div>
          </Card>
        </motion.div>

        {/* editable fields */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="p-6 mt-4 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center gap-1.5">
                <UserIcon className="size-3.5" /> Display name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Aarav Mehta"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="course" className="flex items-center gap-1.5">
                  <GraduationCap className="size-3.5" /> Course
                </Label>
                <Input
                  id="course"
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  placeholder="B.Tech — Engineering Maths"
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

            <div className="space-y-2">
              <Label htmlFor="exam" className="flex items-center gap-1.5">
                <CalendarDays className="size-3.5" /> Target exam date (optional)
              </Label>
              <Input
                id="exam"
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Used to pace your study plan. Leave blank if you're not sure.
              </p>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Email can't be changed here — it's your login.
              </p>
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4 mr-1" />}
                Save changes
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
