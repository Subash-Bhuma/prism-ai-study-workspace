"use client";

import { useEffect, useState } from "react";
import { getProviders, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight, Mail, Lock, User as UserIcon, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

type Mode = "login" | "signup";

export function LoginView() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(false);

  useEffect(() => {
    void getProviders().then((providers) => setGoogleAvailable(Boolean(providers?.google)));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup") {
      if (!name.trim()) return toast.error("Tell us your name");
      if (!email.trim()) return toast.error("Email is required");
      if (password.length < 6) return toast.error("Password must be 6+ characters");
      setLoading(true);
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Signup failed");
        toast.success("Account created — signing you in…");
        // auto sign-in after register
        const result = await signIn("credentials", {
          email: email.trim().toLowerCase(),
          password,
          redirect: false,
        });
        if (result?.error) throw new Error("Sign-in failed after signup");
        router.refresh();
        return;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Signup failed");
        setLoading(false);
        return;
      }
    }
    // login
    if (!email.trim() || !password) return toast.error("Email and password required");
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (result?.error) {
        throw new Error("Wrong email or password");
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  }

  async function handleDemo() {
    setLoading(true);
    toast.info("Logging you into a demo account…");
    try {
      // ensure the demo account exists, then sign in
      await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Demo Student", email: "demo@prism.study", password: "demo123" }),
      }).catch(() => {});
      const result = await signIn("credentials", {
        email: "demo@prism.study",
        password: "demo123",
        redirect: false,
      });
      if (result?.error) throw new Error("Demo login failed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Demo login failed");
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    const result = await signIn("google", { callbackUrl: "/", redirect: false });
    if (result?.error) {
      toast.error("Google sign-in needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server.");
      setLoading(false);
      return;
    }
    if (result?.url) window.location.assign(result.url);
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* brand */}
          <div className="flex flex-col items-center gap-2 mb-8">
            <div className="size-10 rounded-xl bg-primary text-primary-foreground grid place-items-center shadow-sm">
              <Sparkles className="size-5" />
            </div>
            <div className="font-serif text-2xl">Prism</div>
            <p className="text-xs text-muted-foreground -mt-1">your AI study companion</p>
          </div>

          <div className="rounded-2xl border bg-card/80 backdrop-blur p-6 shadow-sm">
            {/* mode toggle */}
            <div className="flex p-1 rounded-lg bg-muted mb-5 text-sm">
              <button
                onClick={() => setMode("login")}
                className={`flex-1 py-1.5 rounded-md transition-colors ${
                  mode === "login" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
                }`}
              >
                Sign in
              </button>
              <button
                onClick={() => setMode("signup")}
                className={`flex-1 py-1.5 rounded-md transition-colors ${
                  mode === "signup" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
                }`}
              >
                Create account
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <AnimatePresence mode="popLayout">
                {mode === "signup" && (
                  <motion.div
                    key="name"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2 overflow-hidden"
                  >
                    <Label htmlFor="name">Name</Label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Aarav Mehta"
                        className="pl-9"
                        autoFocus
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@college.edu"
                    className="pl-9"
                    autoFocus={mode === "login"}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-9"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    {mode === "login" ? "Sign in" : "Create account"}
                    <ArrowRight className="size-4 ml-1" />
                  </>
                )}
              </Button>
            </form>

            {googleAvailable && (
              <>
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">or</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <Button variant="outline" className="w-full mb-2" onClick={handleGoogle} disabled={loading}>
                  <span className="mr-2 grid size-4 place-items-center rounded-full border text-[10px] font-semibold">G</span>
                  Continue with Google
                </Button>
              </>
            )}

            <Button variant="outline" className="mt-2 w-full" onClick={handleDemo} disabled={loading}>
              <Check className="size-4 mr-1.5 text-primary" />
              Try the demo account
            </Button>
          </div>

          <p className="text-center text-[11px] text-muted-foreground mt-5">
            {mode === "login" ? "New to Prism? " : "Already have an account? "}
            <button
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
              className="text-primary underline underline-offset-2"
            >
              {mode === "login" ? "Create one" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
