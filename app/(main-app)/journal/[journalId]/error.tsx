"use client";

import { Button } from "@/components/ui/button";
import { RotateCcwIcon } from "lucide-react";
import { useEffect } from "react";

/**
 * Scoped boundary for a journal.
 *
 * Nested under the journal route on purpose: a journal that will not load
 * degrades to this panel while the top bar and the signed-in shell stay mounted,
 * instead of escaping to `(main-app)/error.tsx` and blanking the whole app.
 *
 * A journal id that does not resolve is a 404 decided on the server, so what
 * lands here is an unreachable database or a genuine fault — `reset()` re-runs
 * the server component, which is the right response to both.
 */
export default function JournalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[journal] failed to load", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5 p-8 text-center">
      <div className="space-y-2">
        <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
          Error
        </p>
        <h2 className="font-serif text-2xl tracking-tight">
          This journal couldn&apos;t be opened
        </h2>
        <p className="max-w-md text-sm text-pretty text-muted-foreground">
          Your entries are safe — this is a problem reaching the server, not
          with your data.
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-muted-foreground">
            Reference: {error.digest}
          </p>
        )}
      </div>
      <Button onClick={reset} variant="secondary">
        <RotateCcwIcon />
        Try again
      </Button>
    </div>
  );
}
