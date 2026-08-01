"use client";

import { clerkAppearanceFor } from "@/lib/clerk-appearance";
import { SignIn } from "@clerk/nextjs";
import { useTheme } from "next-themes";

// A client component only so it can read the resolved theme — Clerk takes its
// palette as a prop, so nothing else can make the card follow `.dark`.
export default function SignInPage() {
  const { resolvedTheme } = useTheme();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <div className="space-y-2 text-center">
        <h1 className="font-serif text-3xl tracking-tight">Better Journal</h1>
        <p className="text-sm text-muted-foreground">
          Pick up where you left off.
        </p>
      </div>
      <SignIn appearance={clerkAppearanceFor(resolvedTheme)} />
    </div>
  );
}
