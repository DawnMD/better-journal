"use client";

import { useSaveStatus } from "@/components/shell/save-status";
import { cn } from "@/lib/utils";
import { useSyncExternalStore } from "react";

/** How often the relative time re-reads the clock. Finer than this says nothing new. */
const TICK_MS = 30_000;

function subscribeToTick(onStoreChange: () => void) {
  const timer = setInterval(onStoreChange, TICK_MS);
  return () => clearInterval(timer);
}

/**
 * The wall clock, rounded down to the tick.
 *
 * Quantised rather than a bare `Date.now()`, which is what makes it legal as a
 * `getSnapshot`: React calls that on every render and compares the result, so a
 * value that changed every millisecond would re-render forever. The rounding
 * costs up to 30s of accuracy on a label whose finest unit is a minute.
 */
const tickNow = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;

/**
 * Null server-side, so the relative half of the label only ever appears on the
 * client. The same call the time grid's now-indicator makes, and for the same
 * reason: the server's clock is not the reader's, and rendering it would print a
 * time that jumps on hydration.
 */
function useTickNow(): number | null {
  return useSyncExternalStore(subscribeToTick, tickNow, () => null);
}

/** "just now" for the first minute, then minutes, then hours. */
function ago(savedAt: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - savedAt) / 1000));

  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  return `${Math.round(minutes / 60)}h ago`;
}

/**
 * The autosave state, as one line of mono in the editor's top bar.
 *
 * Deliberately understated: "Saved" is the expected outcome, so it wears muted
 * ink and no icon. Only the failure gets a colour, because only the failure is
 * news. See components/shell/save-status.ts for why this replaced a toast.
 */
export function SaveIndicator({ className }: { className?: string }) {
  const { state, savedAt } = useSaveStatus();
  const now = useTickNow();

  if (state === "idle" && savedAt === null) return null;

  const label =
    state === "saving"
      ? "Saving…"
      : state === "error"
        ? "Save failed"
        : savedAt !== null && now !== null
          ? `Saved · ${ago(savedAt, now)}`
          : "Saved";

  return (
    <span
      // polite, not assertive: this is a running commentary on a background
      // task, and interrupting a writer mid-sentence to say "saved" is the exact
      // behaviour the toast was removed for.
      aria-live="polite"
      className={cn(
        "shrink-0 font-mono text-[11px] tracking-wide whitespace-nowrap tabular-nums",
        state === "error" ? "text-destructive" : "text-muted-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}
