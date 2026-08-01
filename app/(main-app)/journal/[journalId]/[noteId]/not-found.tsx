"use client";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon, HomeIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

/**
 * 404 for a single note, scoped the same way [noteId]/error.tsx is: the journal
 * around it is still fine, so only the reading pane degrades and the way back is
 * one click.
 *
 * A client component because not-found boundaries are handed no params, and the
 * journal id is the whole reason this page is more useful than the shell-level
 * one above it.
 */
export default function NoteNotFound() {
  const params = useParams<{ journalId?: string }>();

  return (
    <EmptyState
      className="min-h-[50vh]"
      eyebrow="404"
      title="This note doesn't exist"
      description="It may have been deleted, or the link may point at a note that lives in a different journal."
      actions={
        params?.journalId ? (
          <Button
            nativeButton={false}
            variant="outline"
            render={<Link href={`/journal/${params.journalId}`} />}
          >
            <ArrowLeftIcon />
            Back to journal
          </Button>
        ) : (
          <Button nativeButton={false} render={<Link href="/dashboard" />}>
            <HomeIcon />
            Go to dashboard
          </Button>
        )
      }
    />
  );
}
