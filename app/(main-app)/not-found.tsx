import { NotFoundView } from "@/components/not-found-view";
import { Button } from "@/components/ui/button";
import { HomeIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";

/**
 * 404 inside the signed-in shell — in practice a journal id that no longer
 * resolves: trashed, deleted, or never the caller's to begin with. The routers
 * answer all three the same way on purpose (see server/lib/authorize.ts), so
 * this page cannot say which, and should not try.
 *
 * Nested under (main-app) so the sidebar, breadcrumb and ⌘K palette stay
 * mounted: a dead link should cost you the pane, not the app.
 */
export default function MainAppNotFound() {
  return (
    <NotFoundView
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
