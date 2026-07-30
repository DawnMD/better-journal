"use client";

import { Card, CardContent } from "@/components/ui/card";
import { orpc } from "@/lib/orpc.query";
import { clientTimeZone } from "@/lib/timezone";
import { useSuspenseQuery } from "@tanstack/react-query";
import { FlameIcon, LayersIcon, NotebookPenIcon, TypeIcon } from "lucide-react";

/**
 * The KPI row.
 *
 * Four numbers, four tiles — not a four-bar bar chart. These are unrelated
 * magnitudes with different units (days, entries, words); putting them on a shared
 * axis would invent a comparison that does not exist.
 *
 * The streak is the lead tile and gets hero treatment: it is the one number that
 * changes daily and the only one that rewards coming back.
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
      icon: FlameIcon,
      hero: true,
    },
    {
      label: "Entries",
      value: compact(totals.notes),
      hint: `Across ${totals.journals} ${totals.journals === 1 ? "journal" : "journals"}`,
      icon: NotebookPenIcon,
    },
    {
      label: "Words written",
      value: compact(totals.words),
      hint:
        totals.notes > 0
          ? `~${Math.round(totals.words / totals.notes).toLocaleString()} per entry`
          : "Nothing yet",
      icon: TypeIcon,
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
      icon: LayersIcon,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardContent className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <tile.icon className="size-4" aria-hidden />
              <span>{tile.label}</span>
            </div>
            {/* Proportional figures, not tabular: tabular-nums gives every digit
                the width of a 0, which makes a value like 121 look loose at
                display sizes. Tabular is for columns that align vertically. */}
            <div
              className={
                tile.hero
                  ? "text-4xl font-semibold tracking-tight"
                  : "text-2xl font-semibold tracking-tight"
              }
            >
              {tile.value}
            </div>
            <div className="text-xs text-muted-foreground">{tile.hint}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
