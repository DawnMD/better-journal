import { NotFoundView } from "@/components/not-found-view";
import { Button } from "@/components/ui/button";
import { HomeIcon } from "lucide-react";
import Link from "next/link";

/**
 * Root 404: URLs that match no route at all, plus any `notFound()` thrown
 * outside the signed-in shell.
 *
 * Rendered inside the root layout only, so it has no sidebar and no journal
 * context to offer — app/(main-app)/not-found.tsx is the in-app equivalent and
 * is the one that catches a bad journal id.
 */
export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center">
      <NotFoundView
        title="Page not found"
        description="That address doesn't lead anywhere in Better Journal. It may have been mistyped, or the page may have moved."
        actions={
          <Button nativeButton={false} render={<Link href="/dashboard" />}>
            <HomeIcon />
            Go to dashboard
          </Button>
        }
      />
    </main>
  );
}
