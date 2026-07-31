import { cn } from "@/lib/utils";

/**
 * Shared body for every 404 in the app.
 *
 * The three not-found boundaries — root, signed-in shell, single note — differ
 * only in their wording and in where they offer to send you next, so the frame
 * lives here instead of being copied into each one. It deliberately mirrors the
 * error boundaries' layout: a 404 and a failure should not look like different
 * products.
 */
export function NotFoundView({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description: string;
  /** Ways out of the dead end. A 404 with no exit is a trap. */
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center",
        className,
      )}
    >
      <div className="space-y-2">
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          404
        </p>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
