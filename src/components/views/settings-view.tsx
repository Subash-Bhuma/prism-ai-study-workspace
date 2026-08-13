"use client";

import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import {
  Sun,
  Moon,
  Palette,
  Database,
  LogOut,
  Info,
  Cpu,
  RotateCcw,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useMira } from "@/lib/store";
import { toast } from "sonner";

export function SettingsView({
  session,
}: {
  session: { user?: { email?: string | null } } | null;
}) {
  const { theme, setTheme } = useTheme();
  const { resetAll } = useMira();
  const [signingOut, setSigningOut] = useState(false);
  const email = session?.user?.email ?? "";

  const handleReset = async () => {
    if (
      confirm(
        "Delete every subject, uploaded file, attempt, and report from your Prism account?"
      )
    ) {
      await resetAll();
      toast.success("Your study data was deleted.");
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut({ callbackUrl: "/" });
  };

  return (
    <div className="flex-1 overflow-y-auto scroll-fancy">
      <div className="max-w-2xl mx-auto px-6 sm:px-8 py-8 sm:py-10">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-serif text-3xl">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Appearance, data, and your account.
          </p>
        </motion.div>

        {/* Appearance */}
        <Section title="Appearance" icon={<Palette className="size-4" />} delay={0.05}>
          <div className="flex items-center justify-between py-1">
            <div>
              <div className="text-sm font-medium">Theme</div>
              <div className="text-xs text-muted-foreground">
                Switch between light and dark. Prism keeps your choice on this device.
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="gap-1.5 w-28 justify-center"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {theme === "dark" ? "Light" : "Dark"}
            </Button>
          </div>
        </Section>

        {/* Data */}
        <Section title="Data & privacy" icon={<Database className="size-4" />} delay={0.1}>
          <div className="flex items-center justify-between py-1">
            <div className="min-w-0">
              <div className="text-sm font-medium">Delete study data</div>
              <div className="text-xs text-muted-foreground">
                Permanently removes your subjects, uploaded files, attempts, and reports.
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5 shrink-0">
              <RotateCcw className="size-3.5" /> Reset
            </Button>
          </div>
          <Separator className="my-3" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            <span className="text-foreground font-medium">How your files are handled:</span> uploaded
            files are saved on the server so the AI can read them. Text is extracted (PDF text layer
            via pdf-parse; images via vision-model OCR) and stored per-workspace. Nothing leaves the
            server except the AI's responses.
          </div>
        </Section>

        {/* AI model */}
        <Section title="AI engine" icon={<Cpu className="size-4" />} delay={0.15}>
          <div className="flex items-center justify-between py-1">
            <div>
              <div className="text-sm font-medium">Model</div>
              <div className="text-xs text-muted-foreground">
                Every feature — step checking, hints, curriculum mapping, theory, reports — runs on
                this model.
              </div>
            </div>
            <Badge variant="secondary" className="font-mono text-xs">glm-4.7-flash</Badge>
          </div>
          <Separator className="my-3" />
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Capability label="Step checking" value="real-time" />
            <Capability label="Hint ladder" value="4 rungs" />
            <Capability label="OCR (images)" value="local Tesseract" />
            <Capability label="Curriculum map" value="from your files" />
          </div>
        </Section>

        {/* Account */}
        <Section title="Account" icon={<Info className="size-4" />} delay={0.2}>
          <div className="flex items-center justify-between py-1">
            <div className="min-w-0">
              <div className="text-sm font-medium">Signed in as</div>
              <div className="text-xs text-muted-foreground truncate">{email}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              disabled={signingOut}
              className="gap-1.5 shrink-0 text-destructive hover:text-destructive"
            >
              <LogOut className="size-3.5" /> {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </Section>

        {/* About */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mt-4 text-center text-[11px] text-muted-foreground"
        >
          Prism · built for DEMUX · AI stays silent while you're right.
        </motion.div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  delay,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="mt-4"
    >
      <div className="flex items-center gap-1.5 mb-1.5 px-1 text-xs uppercase tracking-wider text-muted-foreground font-medium">
        {icon}
        {title}
      </div>
      <Card className="p-5">{children}</Card>
    </motion.div>
  );
}

function Capability({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
