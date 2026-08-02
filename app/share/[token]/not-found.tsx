import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import Link from "next/link";

/**
 * A share link that leads nowhere: revoked, or its note deleted, or its journal
 * moved to the trash — or simply mistyped.
 *
 * The root 404 would offer "Go to dashboard", which for the person a link was
 * sent to is a redirect to a sign-in form for an account they do not have. This
 * one offers the front page instead, and says nothing about which of the four
 * cases it was — the reader has no session, so there is nothing here to confirm
 * to them, least of all that a given token used to be real.
 */
export default function ShareNotFound() {
  return (
    <main className="flex flex-1 items-center justify-center">
      <EmptyState
        eyebrow="Link unavailable"
        title="This entry isn't shared anymore"
        description="The link may have been turned off by whoever sent it, or it may never have been valid. Ask them for a new one."
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
            About Better Journal
          </Button>
        }
      />
    </main>
  );
}
