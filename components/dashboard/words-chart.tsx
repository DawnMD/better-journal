"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDate, formatNumber } from "@/lib/format";
import { orpc } from "@/lib/orpc.query";
import { clientTimeZone } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { useSuspenseQuery } from "@tanstack/react-query";
import { TableIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

/**
 * Words written over time.
 *
 * A single series, so there is deliberately no legend — the card title already
 * says what is plotted, and a one-swatch legend box would just restate it.
 *
 * Built on the shadcn chart wrapper: `ChartContainer` owns the responsive box
 * and turns `ChartConfig` colors into `--color-*` variables, so the marks below
 * reference `var(--color-words)` and inherit the validated ramp in both themes
 * without a second set of tokens. Marks are still held to spec by hand — 2px
 * line, solid hairline grid, ~10% area wash, 8px active marker with a 2px
 * surface ring — since Recharts' defaults are heavier than that.
 */

type Range = "30d" | "90d" | "12m";

const RANGE_LABELS: Record<Range, string> = {
  "30d": "30 days",
  "90d": "90 days",
  "12m": "12 months",
};

const chartConfig = {
  words: {
    label: "Words",
    color: "var(--viz-series-1)",
  },
} satisfies ChartConfig;

/** Round an axis maximum up to a clean number, so ticks read 0 / 500 / 1,000. */
function niceMax(value: number): number {
  if (value <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function formatBucket(bucket: string, isMonthly: boolean): string {
  // Parsed as local parts, not `new Date(bucket)` — that reads a bare
  // "yyyy-MM-dd" as UTC midnight and can shift the label back a day.
  const [y, m, d] = bucket.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);

  // Pinned locale, not the ambient one — this string is rendered during SSR and
  // again on hydration, and the two runtimes do not agree on "31 Jul" vs "Jul 31".
  return isMonthly
    ? formatDate(date, { month: "short", year: "numeric" })
    : formatDate(date, { month: "short", day: "numeric" });
}

export const WordsChart = () => {
  const timeZone = clientTimeZone();
  const [range, setRange] = useState<Range>("90d");
  const [showTable, setShowTable] = useState(false);

  const { data } = useSuspenseQuery(
    orpc.statsRouter.getWordCounts.queryOptions({ input: { range, timeZone } }),
  );

  const isMonthly = data.bucket === "month";
  const points = data.points;

  const max = useMemo(
    () => niceMax(Math.max(...points.map((p) => p.words), 0)),
    [points],
  );

  const totalWords = points.reduce((sum, p) => sum + p.words, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Words written</CardTitle>
        <CardDescription>
          {formatNumber(totalWords)} words over the last{" "}
          {RANGE_LABELS[range].toLowerCase()}
        </CardDescription>
        {/* One filter row, above the plot it scopes — never inside the plot. */}
        <CardAction className="flex items-center gap-1">
          {(Object.keys(RANGE_LABELS) as Range[]).map((option) => (
            <Button
              key={option}
              variant="ghost"
              size="sm"
              aria-pressed={range === option}
              className={cn(range === option && "bg-muted")}
              onClick={() => setRange(option)}
            >
              {RANGE_LABELS[option]}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="icon"
            aria-pressed={showTable}
            aria-label="Toggle table view"
            onClick={() => setShowTable((v) => !v)}
          >
            <TableIcon className="size-4" />
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        {showTable ? (
          <WordsTable points={points} isMonthly={isMonthly} />
        ) : (
          // aspect-auto overrides the container's default aspect-video: this card
          // is far wider than it is tall, and a 16:9 box would make it enormous.
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[220px] w-full"
            role="img"
            aria-label={`Words written per ${isMonthly ? "month" : "day"} over the last ${RANGE_LABELS[range]}. Total ${formatNumber(totalWords)} words.`}
          >
            <AreaChart
              accessibilityLayer
              data={points}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
              {/* Horizontal only, and solid — dashed gridlines read as
                  "threshold" when this is just a grid. */}
              <CartesianGrid
                vertical={false}
                stroke="var(--viz-grid)"
                strokeDasharray=""
              />

              <XAxis
                dataKey="bucket"
                tickLine={false}
                axisLine={{ stroke: "var(--viz-axis)" }}
                tickMargin={8}
                // A label per daily bucket would overlap into an unreadable
                // smear, so Recharts drops ticks until they clear each other.
                minTickGap={48}
                tickFormatter={(value: string) => formatBucket(value, isMonthly)}
              />

              <YAxis
                width={48}
                domain={[0, max]}
                tickCount={5}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value: number) => formatNumber(value)}
              />

              <ChartTooltip
                cursor={{ stroke: "var(--viz-axis)", strokeWidth: 1 }}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const bucket = payload?.[0]?.payload?.bucket as
                        | string
                        | undefined;
                      return bucket ? formatBucket(bucket, isMonthly) : "";
                    }}
                    formatter={(value, _name, item) => {
                      const words = Number(value);
                      const notes = Number(item?.payload?.notes ?? 0);

                      return (
                        <span className="text-muted-foreground">
                          {formatNumber(words)} {words === 1 ? "word" : "words"}
                          {notes > 0 &&
                            ` · ${notes} ${notes === 1 ? "entry" : "entries"}`}
                        </span>
                      );
                    }}
                  />
                }
              />

              <Area
                dataKey="words"
                type="linear"
                stroke="var(--color-words)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                // A wash at ~10% — a hint of volume, never a saturated block.
                fill="var(--color-words)"
                fillOpacity={0.1}
                // No dot per bucket; daily buckets sit ~7px apart and would fuse
                // into a bead chain. The 8px active dot appears on hover, ringed
                // in the surface color so it stays legible over the line.
                dot={false}
                activeDot={{
                  r: 4,
                  fill: "var(--color-words)",
                  stroke: "var(--viz-surface)",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
};

function WordsTable({
  points,
  isMonthly,
}: {
  points: { bucket: string; words: number; notes: number }[];
  isMonthly: boolean;
}) {
  // Only buckets with activity; a table of mostly zeroes hides the signal.
  const rows = points.filter((point) => point.words > 0 || point.notes > 0);

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nothing written in this range yet.
      </p>
    );
  }

  return (
    <div className="max-h-72 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 font-medium">{isMonthly ? "Month" : "Day"}</th>
            <th className="py-2 text-right font-medium">Entries</th>
            <th className="py-2 text-right font-medium">Words</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.bucket} className="border-b last:border-0">
              <td className="py-1.5">{formatBucket(row.bucket, isMonthly)}</td>
              <td className="py-1.5 text-right tabular-nums">{row.notes}</td>
              <td className="py-1.5 text-right tabular-nums">
                {formatNumber(row.words)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
