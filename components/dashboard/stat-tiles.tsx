"use client";

import { orpc } from "@/lib/orpc.query";
import { cn } from "@/lib/utils";
import { clientTimeZone } from "@/lib/timezone";
import { useSuspenseQuery } from "@tanstack/react-query";

/**
 * The KPI row.
 *
 * Four numbers, four tiles — not a four-bar bar chart. These are unrelated
 * magnitudes with different units (days, entries, words); putting them on a shared
 * axis would invent a comparison that does not exist.
 *
 * The streak is the lead tile and gets hero treatment: it is the one number that
 * changes daily and the only one that rewards coming back.
 *
 * One bordered row divided by hairlines, not four `Card`s. Four cards draw twelve
 * border segments and three gutters to say "these four things are related", which
 * is precisely what a single row says with three lines. The icons went with them:
 * a flame beside "Current streak" and a T beside "Words written" are decoration
 * for labels that were already unambiguous, and at this density decoration is
 * what makes a page look like a template.
 */

/** 1,284 / 12.9K / 1.4M — keeps a tile from being 60% digits. */
function compact(value: number): string {
  if (value < 10_000) return value.toLocaleString();
  if (value < 1_000_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export const StatTiles = () => {
  const timeZone = clientTimeZone();

  const { data: totals } = useSuspenseQuery(
    orpc.statsRouter.getTotals.queryOptions({ input: { timeZone } }),
  );
  const { data: streak } = useSuspenseQuery(
    orpc.statsRouter.getStreak.queryOptions({ input: { timeZone } }),
  );

  const tiles = [
    {
      label: "Current streak",
      value: streak.current === 1 ? "1 day" : `${compact(streak.current)} days`,
      hint:
        streak.longest > 0
          ? `Longest ${streak.longest === 1 ? "1 day" : `${streak.longest} days`}`
          : "Write today to start one",
      hero: true,
    },
    {
      label: "Entries",
      value: compact(totals.notes),
      hint: `Across ${totals.journals} ${totals.journals === 1 ? "journal" : "journals"}`,
    },
    {
      label: "Words written",
      value: compact(totals.words),
      hint:
        totals.notes > 0
          ? `~${Math.round(totals.words / totals.notes).toLocaleString()} per entry`
          : "Nothing yet",
    },
    {
      label: "Days active",
      value: compact(totals.daysActive),
      hint: totals.firstEntry
        ? `Since ${new Date(totals.firstEntry).toLocaleDateString(undefined, {
            month: "short",
            year: "numeric",
          })}`
        : "No entries yet",
    },
  ];

  return (
    <div className="grid grid-cols-2 rounded-lg border border-border/70 sm:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className={cn(
            "flex flex-col gap-1.5 p-4 sm:p-5",
            // Dividers drawn as each cell's own left/top edge, with the first of
            // each run suppressed — the container supplies the outer frame, so
            // there is never a doubled line. Same trick the month grid uses.
            "border-t border-l border-border/70",
            "[&:nth-child(-n+2)]:border-t-0 [&:nth-child(2n+1)]:border-l-0",
            "sm:border-t-0 sm:[&:nth-child(2n+1)]:border-l sm:[&:first-child]:border-l-0",
          )}
        >
          <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            {tile.label}
          </div>
          {/* Proportional figures, not tabular: tabular-nums gives every digit
              the width of a 0, which makes a value like 121 look loose at
              display sizes. Tabular is for columns that align vertically. */}
          <div
            className={cn(
              "font-serif tracking-tight",
              tile.hero ? "text-4xl" : "text-3xl",
            )}
          >
            {tile.value}
          </div>
          <div className="text-xs text-muted-foreground">{tile.hint}</div>
        </div>
      ))}
    </div>
  );
};
