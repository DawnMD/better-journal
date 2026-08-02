import { ThemeToggle } from "@/components/marketing/theme-toggle";
import { Button } from "@/components/ui/button";
import Link from "next/link";

/**
 * The landing page's top bar.
 *
 * Deliberately the same 56px, the same border and the same blurred backdrop as
 * `AppTopbar`, so signing in doesn't feel like arriving at a different product —
 * the wordmark stays exactly where it was and the chrome around it doesn't move.
 *
 * What sits on the right depends on whether there is already a session. Someone
 * who is signed in and lands here — a bookmarked root, a link from outside —
 * should be offered the app rather than a second invitation to create an account
 * they already have.
 */
export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md supports-backdrop-blur:bg-background/65">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="shrink-0 rounded-sm font-serif text-[15px] font-medium tracking-tight focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Better&nbsp;Journal
        </Link>

        <nav className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            className="hidden font-normal text-muted-foreground hover:text-foreground sm:inline-flex"
            render={<Link href="/#features" />}
          >
            Features
          </Button>

          <ThemeToggle />

          {signedIn ? (
            <Button
              size="sm"
              nativeButton={false}
              render={<Link href="/dashboard" />}
            >
              Open journal
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                className="font-normal text-muted-foreground hover:text-foreground"
                render={<Link href="/sign-in" />}
              >
                Sign in
              </Button>
              <Button
                size="sm"
                nativeButton={false}
                render={<Link href="/sign-up" />}
              >
                Get started
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
