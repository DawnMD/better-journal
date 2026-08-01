"use client";

import { clerkAppearanceFor } from "@/lib/clerk-appearance";
import { SignUp } from "@clerk/nextjs";
import { useTheme } from "next-themes";

// Client for the same reason as the sign-in page: Clerk's palette is a prop.
export default function SignUpPage() {
  const { resolvedTheme } = useTheme();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <div className="space-y-2 text-center">
        <h1 className="font-serif text-3xl tracking-tight">Better Journal</h1>
        <p className="text-sm text-muted-foreground">
          A private place to write things down.
        </p>
      </div>
      <SignUp appearance={clerkAppearanceFor(resolvedTheme)} />
    </div>
  );
}
