import { cn } from "@/lib/utils";

/**
 * Every "there is nothing here" in the app, in one shape.
 *
 * Generalised from what used to be `NotFoundView`. The 404 pages, the calendar's
 * empty month and an account with no journals yet are the same moment from the
 * reader's side — a screen with no content on it — and they were reading as three
 * different products: a centred panel, a bare grey sentence, and a sidebar row.
 *
 * The shape is the one the 404s already had, because it was the right one: a mono
 * eyebrow that classifies the situation without shouting, a serif line that says
 * what happened, muted prose that says why, and a way out. A dead end with no exit
 * is a trap — which is why `actions` exists and why the 404s always pass it.
 */
export function EmptyState({
  eyebrow,
  title,
  description,
  actions,
  size = "default",
  className,
}: {
  /** Classifier, set in mono: "404", "Empty", "No results". Optional. */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Ways onward. Omit only where the surrounding page already offers one. */
  actions?: React.ReactNode;
  /**
   * `default` fills a route. `inline` sits inside a page that already has its own
   * heading and chrome — the calendar under its grid, a popover's list.
   */
  size?: "default" | "inline";
  className?: string;
}) {
  // An `inline` empty state sits under a page that already has its own <h1> —
  // the journal's title above the calendar — so it must not claim a second one.
  const Title = size === "default" ? "h1" : "p";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        size === "default" ? "min-h-[60vh] gap-5 p-8" : "gap-3 px-4 py-10",
        className,
      )}
    >
      <div className="space-y-2">
        {eyebrow && (
          <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
            {eyebrow}
          </p>
        )}
        <Title
          className={cn(
            "font-serif tracking-tight text-balance",
            size === "default" ? "text-2xl" : "text-lg",
          )}
        >
          {title}
        </Title>
        {description && (
          <p className="max-w-md text-sm text-pretty text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
