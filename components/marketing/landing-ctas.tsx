import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { auth } from "@clerk/nextjs/server";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

/**
 * The landing page's three calls to action that depend on the session.
 *
 * `/` is served from the CDN as a static shell, so the session is read only
 * here, each call to action inside its own Suspense boundary. The streamed HTML
 * still carries the right one: a signed-in visitor gets "Open your journal",
 * never a "Start writing" that swaps under them after hydration.
 *
 * Until the session is read, each boundary holds an invisible placeholder the
 * size of what replaces it. It holds no text, because any text it held would be
 * a guess that is wrong for one of the two kinds of visitor.
 */

async function isSignedIn() {
  const { userId } = await auth();
  return userId !== null;
}

function Placeholder({ className }: { className: string }) {
  return <span aria-hidden className={cn("invisible block", className)} />;
}

/** The right of the site header: "Open journal", or "Sign in" and "Get started". */
export function HeaderCta() {
  return (
    <Suspense fallback={<Placeholder className="h-7 w-36" />}>
      <HeaderCtaForSession />
    </Suspense>
  );
}

async function HeaderCtaForSession() {
  if (await isSignedIn()) {
    return (
      <Button size="sm" nativeButton={false} render={<Link href="/dashboard" />}>
        Open journal
      </Button>
    );
  }

  return (
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
      <Button size="sm" nativeButton={false} render={<Link href="/sign-up" />}>
        Get started
      </Button>
    </>
  );
}

/**
 * The two doors under the hero's claim.
 *
 * Without JavaScript a streamed boundary is never swapped in, so its fallback
 * also offers one door that is right for everyone: `/dashboard` opens the
 * journal for a signed-in visitor and sends anyone else to sign in.
 */
export function HeroCta() {
  return (
    <Suspense
      fallback={
        <>
          <Placeholder className="h-9 w-72" />
          <noscript>
            <Button
              size="lg"
              nativeButton={false}
              render={<Link href="/dashboard" />}
            >
              Open the app
              <ArrowRightIcon />
            </Button>
          </noscript>
        </>
      }
    >
      <HeroCtaForSession />
    </Suspense>
  );
}

async function HeroCtaForSession() {
  if (await isSignedIn()) {
    return (
      <Button size="lg" nativeButton={false} render={<Link href="/dashboard" />}>
        Open your journal
        <ArrowRightIcon />
      </Button>
    );
  }

  return (
    <>
      <Button size="lg" nativeButton={false} render={<Link href="/sign-up" />}>
        Start writing
        <ArrowRightIcon />
      </Button>
      <Button
        variant="outline"
        size="lg"
        nativeButton={false}
        render={<Link href="/sign-in" />}
      >
        I already have an account
      </Button>
    </>
  );
}

/**
 * The closing card's contents: its line, its prose and its button all speak to
 * whether the visitor already has a journal.
 */
export function ClosingCardCta() {
  return (
    <Suspense
      fallback={<Placeholder className="h-[136px] w-full sm:h-[140px]" />}
    >
      <ClosingCardCtaForSession />
    </Suspense>
  );
}

async function ClosingCardCtaForSession() {
  const signedIn = await isSignedIn();

  return (
    <>
      <div className="space-y-2">
        <h2 className="font-serif text-2xl tracking-tight text-balance sm:text-3xl">
          {signedIn ? "Welcome back." : "Today is a fine first entry."}
        </h2>
        <p className="mx-auto max-w-md text-sm text-pretty text-muted-foreground">
          {signedIn
            ? "Your entries, your calendar and your streak are where you left them."
            : "It takes about a minute to set up, and the first thing you see is a blank page waiting for you."}
        </p>
      </div>

      <Button
        size="lg"
        nativeButton={false}
        render={<Link href={signedIn ? "/dashboard" : "/sign-up"} />}
      >
        {signedIn ? "Open your journal" : "Create your journal"}
        <ArrowRightIcon />
      </Button>
    </>
  );
}
