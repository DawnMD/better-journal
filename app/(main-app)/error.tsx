"use client";

import { Button } from "@/components/ui/button";
import { RotateCcwIcon } from "lucide-react";
import { useEffect } from "react";

/**
 * Error boundary for the signed-in shell.
 *
 * `useSuspenseQuery` *throws* on failure — it never returns `isError: true` — so
 * before this existed any RPC failure escaped to Next's default error page and
 * took the whole layout with it. The three `if (isError)` branches that used to
 * sit in the query components were unreachable dead code.
 */
export default function MainAppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side causes are already logged where they happened; this catches
    // the client half so a failure is not invisible in the browser.
    console.error("[app] unhandled error", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 p-8 text-center">
      <div className="space-y-2">
        <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
          Error
        </p>
        <h2 className="font-serif text-2xl tracking-tight">
          Something went wrong
        </h2>
        <p className="max-w-md text-sm text-pretty text-muted-foreground">
          We couldn&apos;t load this page. Your entries are safe — this is a
          problem reaching the server, not with your data.
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
