import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/providers";

export const metadata: Metadata = {
  title: "Prism — your AI study companion",
  description:
    "Prism is an AI study companion. Solve, write, revise inside the subject. The AI stays silent while you're right, and steps in only when you're stuck.",
  keywords: ["Prism", "AI tutor", "study", "exam prep", "practice", "DEMUX"],
  authors: [{ name: "VisionaryMinds" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="antialiased bg-background text-foreground"
      >
        <ThemeProvider>
          {children}
          <Toaster />
          <SonnerToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
