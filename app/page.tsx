import { HeroPreview } from "@/components/marketing/hero-preview";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  FlameIcon,
  LockIcon,
  PenLineIcon,
  SearchIcon,
  TagsIcon,
} from "lucide-react";
import Link from "next/link";

/**
 * The front door.
 *
 * This route used to `redirect("/dashboard")`, which meant the middleware
 * bounced every stranger straight to `/sign-in` — the first thing anyone saw was
 * a password field for an account they had no reason to want yet. So `/` is now
 * public (see proxy.ts) and says what the app is before asking for anything.
 *
 * A session is read here rather than in a client component because this page is
 * the one screen that is reached with and without one, and the version rendered
 * without JavaScript should already be right: a signed-in visitor gets "Open
 * your journal", not a "Get started" button that swaps under them after
 * hydration.
 */

export const metadata: Metadata = {
  title: "Better Journal — a private place to write things down",
  description:
    "A rich-text journal with autosave, full-text search across every entry, a calendar of what you wrote when, and a dashboard of streaks and word counts.",
};

export default async function HomePage() {
  const { userId } = await auth();
  const signedIn = userId !== null;

  return (
    <>
      <SiteHeader signedIn={signedIn} />

      <main className="flex-1">
        <Hero signedIn={signedIn} />
        <Features />
        <ClosingCta signedIn={signedIn} />
      </main>

      <SiteFooter />
    </>
  );
}

/**
 * The claim, and the two doors under it.
 *
 * Centred, in the display serif, on the same shape `AuthShell` and `EmptyState`
 * already use — eyebrow, serif line, muted prose. The three screens a visitor
 * can be on before they have written anything should read as one voice.
 */
function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pt-16 pb-14 sm:px-6 sm:pt-24">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 text-center">
        <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
          Journal · Calendar · Search
        </p>

        <h1 className="font-serif text-4xl tracking-tight text-balance sm:text-5xl">
          Write it down. Find it again.
        </h1>

        <p className="max-w-xl text-base leading-relaxed text-pretty text-muted-foreground">
          Better Journal is a private, rich-text journal that saves as you type,
          files every entry on the day you wrote it, and can answer{" "}
          <span className="font-serif italic">
            &ldquo;what did I actually write this year?&rdquo;
          </span>{" "}
          in one search.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          {signedIn ? (
            <Button
              size="lg"
              nativeButton={false}
              render={<Link href="/dashboard" />}
            >
              Open your journal
              <ArrowRightIcon />
            </Button>
          ) : (
            <>
              <Button
                size="lg"
                nativeButton={false}
                render={<Link href="/sign-up" />}
              >
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
          )}
        </div>

        <p className="font-mono text-[11px] text-muted-foreground">
          Free · No credit card · Your entries stay yours
        </p>
      </div>

      <div className="mx-auto mt-14 max-w-2xl">
        <HeroPreview />
      </div>
    </section>
  );
}

/**
 * What is actually in the box.
 *
 * Six, and each one names a thing the app does rather than a quality it claims
 * to have — "full-text search across every entry" is checkable; "powerful" is
 * not. The mono eyebrows carry the same classifier role they do everywhere else.
 */
const FEATURES = [
  {
    icon: PenLineIcon,
    title: "An editor, not a text box",
    description:
      "Headings, quotes, lists and emphasis, stored as a real document. Every keystroke autosaves — there is no Save button to forget.",
  },
  {
    icon: CalendarDaysIcon,
    title: "Your year, by day",
    description:
      "Month, week and day views of what you wrote when. Days are bucketed in your timezone, so a 2am entry lands on the night you wrote it.",
  },
  {
    icon: SearchIcon,
    title: "Search that reads the words",
    description:
      "Full-text search across every entry from ⌘K — stemmed, ranked, with the matching line shown so you know which one to open.",
  },
  {
    icon: TagsIcon,
    title: "Tags, not folders",
    description:
      "Label an entry with as many tags as it deserves, then filter the calendar down to one thread of your life.",
  },
  {
    icon: FlameIcon,
    title: "Streaks and word counts",
    description:
      "A contribution heatmap of the year, your current and longest streak, and how much you have written over the last 90 days.",
  },
  {
    icon: LockIcon,
    title: "Private, and portable",
    description:
      "Entries are yours alone. Deleting moves to a trash you can undo, and any journal can be exported to plain Markdown.",
  },
] as const;

function Features() {
  return (
    <section
      id="features"
      className="scroll-mt-20 border-t border-border/70 bg-muted/30"
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
        <div className="max-w-xl space-y-2">
          <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
            What you get
          </p>
          <h2 className="font-serif text-2xl tracking-tight sm:text-3xl">
            Everything a journal needs, and nothing else
          </h2>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="[--card-spacing:--spacing(5)]">
              <CardHeader>
                <span className="mb-2 flex size-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Icon className="size-4" />
                </span>
                <CardTitle className="text-[15px]">{title}</CardTitle>
                <CardDescription className="text-pretty">
                  {description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * The last ask.
 *
 * A page whose only purpose is to hand someone to `/sign-up` should not make
 * them scroll back to the top to get there.
 */
function ClosingCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
      <Card className="[--card-spacing:--spacing(8)]">
        <CardContent className="flex flex-col items-center gap-5 text-center">
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
        </CardContent>
      </Card>
    </section>
  );
}
