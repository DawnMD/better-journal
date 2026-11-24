import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { HomeIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";

/**
 * The 404 for a journal id that does not resolve: trashed, purged, or never the
 * caller's to begin with. Journal access answers all three with NOT_FOUND on
 * purpose (see server/lib/journal-access.ts), so this view cannot say which,
 * and should not try.
 *
 * Shared because the miss can surface in two places: the server page, which
 * calls notFound() and lands on the (main-app) not-found boundary, and the
 * client query, which throws into the journal's error boundary — a journal
 * trashed from another tab while this one is open. Both show this same view.
 */
export function JournalNotFound() {
  return (
    <EmptyState
      eyebrow="404"
      title="We couldn't find that"
      description="This journal may have been deleted or moved to trash, or the link may be wrong. Your other entries are unaffected."
      actions={
        <>
          <Button nativeButton={false} render={<Link href="/dashboard" />}>
            <HomeIcon />
            Go to dashboard
          </Button>
          <Button
            nativeButton={false}
            variant="outline"
            render={<Link href="/trash" />}
          >
            <Trash2Icon />
            Check trash
          </Button>
        </>
      }
    />
  );
}
