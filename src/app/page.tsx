"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useMira } from "@/lib/store";
import { AppShell } from "@/components/app-shell";
import { LoginView } from "@/components/views/login-view";
import { OnboardingView } from "@/components/views/onboarding";
import { DashboardView } from "@/components/views/dashboard";
import { WorkspaceView } from "@/components/views/workspace";
import { ProfileView } from "@/components/views/profile-view";
import { SettingsView } from "@/components/views/settings-view";
import { Sparkles } from "lucide-react";

export default function Home() {
  const { data: session, status } = useSession();
  const {
    view,
    activeWorkspaceId,
    hydrated,
    serverHydrated,
    hydrateApp,
    hydrateWorkspace,
    setView,
  } = useMira();

  useEffect(() => {
    if (status === "authenticated" && hydrated && !serverHydrated) {
      void hydrateApp();
    }
  }, [status, hydrated, serverHydrated, hydrateApp]);

  // If we reload straight into a workspace, pull resources + concepts from the
  // backend so the server stays the source of truth (not just localStorage).
  useEffect(() => {
    if (hydrated && view === "workspace" && activeWorkspaceId) {
      void hydrateWorkspace(activeWorkspaceId);
    }
  }, [hydrated]);

  // Loading state while NextAuth resolves the session.
  if (
    status === "loading" ||
    !hydrated ||
    (status === "authenticated" && !serverHydrated)
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-9 rounded-xl bg-primary text-primary-foreground grid place-items-center animate-soft-pulse">
            <Sparkles className="size-4.5" />
          </div>
          <div className="font-serif text-lg">Prism</div>
          <div className="text-xs text-muted-foreground">waking up…</div>
        </div>
      </div>
    );
  }

  // Not authenticated → login screen.
  if (status === "unauthenticated" || !session?.user) {
    return <LoginView />;
  }

  // Authenticated but hasn't completed the two-screen onboarding.
  const onboarded = (session.user as { onboarded?: boolean }).onboarded;
  if (!onboarded && view !== "onboarding") {
    // Force the onboarding view until the user finishes it.
    return (
      <OnboardingView
        email={session.user.email ?? ""}
        onDone={() => {
          // the onboarding view calls completeOnboarding which PATCHes the DB
          // and updates the session; we then route to dashboard.
          setView("dashboard");
        }}
      />
    );
  }
  if (view === "onboarding") {
    return (
      <OnboardingView
        email={session.user.email ?? ""}
        onDone={() => setView("dashboard")}
      />
    );
  }

  // Authenticated + onboarded → the app shell with view switching.
  return (
    <AppShell session={session}>
      {view === "profile" ? (
        <ProfileView session={session} />
      ) : view === "settings" ? (
        <SettingsView session={session} />
      ) : view === "workspace" && activeWorkspaceId ? (
        <WorkspaceView />
      ) : (
        <DashboardView />
      )}
    </AppShell>
  );
}
