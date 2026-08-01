"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeftIcon, RotateCcwIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Scoped boundary for a single note.
 *
 * Nested under the journal route on purpose: a note that will not load degrades
 * to this panel while the sidebar and journal shell stay usable, instead of
 * blanking the app.
 *
 * This is failures only. A note id that does not resolve — a stale bookmark, a
 * deleted entry, someone else's id — is a 404 and is caught by the not-found
 * boundary beside this file, so "try again" is never offered for a note that is
 * simply gone. What lands here is an unreachable server or a genuine fault —
 * worth retrying.
 */
export default function NoteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ journalId: string }>();

  useEffect(() => {
    console.error("[note] failed to load", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">
          This note couldn&apos;t be opened
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          The note is still there — this is a problem reaching it.
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={reset} variant="secondary">
          <RotateCcwIcon />
          Try again
        </Button>
        {params?.journalId && (
          <Button
            nativeButton={false}
            variant="outline"
            render={<Link href={`/journal/${params.journalId}`} />}
          >
            <ArrowLeftIcon />
            Back to journal
          </Button>
        )}
      </div>
    </div>
  );
}
