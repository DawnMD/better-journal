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
import { orpc } from "@/lib/orpc.query";
import { clientTimeZone } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { useSuspenseQuery } from "@tanstack/react-query";
import { TableIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";

/**
 * Words written over time.
 *
 * A single series, so there is deliberately no legend — the card title already
 * says what is plotted, and a one-swatch legend box would just restate it.
 *
 * Hand-rolled SVG rather than a charting library: the whole chart is one path, an
 * area wash and a hover layer, and adding Recharts for that would be more
 * dependency than drawing. It also keeps the marks exactly to spec — 2px line,
 * hairline solid grid, 8px marker, 2px surface ring.
 */

type Range = "30d" | "90d" | "12m";

const RANGE_LABELS: Record<Range, string> = {
  "30d": "30 days",
  "90d": "90 days",
  "12m": "12 months",
};

const WIDTH = 720;
const HEIGHT = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 48 };

const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

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

  return isMonthly
    ? date.toLocaleDateString(undefined, { month: "short", year: "numeric" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export const WordsChart = () => {
  const timeZone = clientTimeZone();
  const [range, setRange] = useState<Range>("90d");
  const [showTable, setShowTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();

  const { data } = useSuspenseQuery(
    orpc.statsRouter.getWordCounts.queryOptions({ input: { range, timeZone } }),
  );

  const isMonthly = data.bucket === "month";
  const points = data.points;

  const { max, linePath, areaPath, coords } = useMemo(() => {
    const values = points.map((p) => p.words);
    const max = niceMax(Math.max(...values, 0));

    const coords = points.map((point, index) => ({
      x:
        PAD.left +
        (points.length <= 1 ? PLOT_W / 2 : (index / (points.length - 1)) * PLOT_W),
      y: PAD.top + PLOT_H - (point.words / max) * PLOT_H,
      ...point,
    }));

    const linePath = coords
      .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`)
      .join(" ");

    const areaPath =
      coords.length > 0
        ? `${linePath} L${coords[coords.length - 1]!.x.toFixed(2)},${PAD.top + PLOT_H} L${coords[0]!.x.toFixed(2)},${PAD.top + PLOT_H} Z`
        : "";

    return { max, linePath, areaPath, coords };
  }, [points]);

  const totalWords = points.reduce((sum, p) => sum + p.words, 0);
  const active = hover !== null ? coords[hover] : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Words written</CardTitle>
        <CardDescription>
          {totalWords.toLocaleString()} words over the last{" "}
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
              onClick={() => {
                setRange(option);
                setHover(null);
              }}
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
          <div className="relative">
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="w-full"
              style={{ height: HEIGHT }}
              role="img"
              aria-label={`Words written per ${isMonthly ? "month" : "day"} over the last ${RANGE_LABELS[range]}. Total ${totalWords.toLocaleString()} words.`}
              onMouseLeave={() => setHover(null)}
              onMouseMove={(event) => {
                // Nearest-point rather than per-mark hit testing: daily buckets
                // are ~7px apart, far below a usable target, so the whole plot is
                // the hit area and the closest x wins.
                const rect = event.currentTarget.getBoundingClientRect();
                const ratio = (event.clientX - rect.left) / rect.width;
                const x = ratio * WIDTH;
                const index = Math.round(
                  ((x - PAD.left) / PLOT_W) * (points.length - 1),
                );
                setHover(Math.max(0, Math.min(points.length - 1, index)));
              }}
            >
              <defs>
                <clipPath id={clipId}>
                  <rect
                    x={PAD.left}
                    y={PAD.top}
                    width={PLOT_W}
                    height={PLOT_H}
                  />
                </clipPath>
              </defs>

              {/* Gridlines: solid hairlines one step off the surface, never
                  dashed — dashing reads as "threshold" when it is just a grid. */}
              {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
                const y = PAD.top + PLOT_H * fraction;
                const value = Math.round(max * (1 - fraction));

                return (
                  <g key={fraction}>
                    <line
                      x1={PAD.left}
                      x2={WIDTH - PAD.right}
                      y1={y}
                      y2={y}
                      stroke="var(--viz-grid)"
                      strokeWidth={1}
                    />
                    <text
                      x={PAD.left - 8}
                      y={y + 3}
                      textAnchor="end"
                      fontSize={10}
                      fill="var(--viz-muted)"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {value.toLocaleString()}
                    </text>
                  </g>
                );
              })}

              {/* Area wash at ~10% — a hint of volume, never a saturated block. */}
              <path
                d={areaPath}
                fill="var(--viz-series-1)"
                fillOpacity={0.1}
                clipPath={`url(#${clipId})`}
              />

              <path
                d={linePath}
                fill="none"
                stroke="var(--viz-series-1)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* Baseline */}
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={PAD.top + PLOT_H}
                y2={PAD.top + PLOT_H}
                stroke="var(--viz-axis)"
                strokeWidth={1}
              />

              {/* X labels: first, middle, last only. A label per daily bucket
                  would overlap into an unreadable smear. */}
              {[0, Math.floor(points.length / 2), points.length - 1]
                .filter((i, idx, arr) => i >= 0 && arr.indexOf(i) === idx)
                .map((index) => {
                  const point = coords[index];
                  if (!point) return null;

                  return (
                    <text
                      key={index}
                      x={point.x}
                      y={HEIGHT - 8}
                      textAnchor={
                        index === 0
                          ? "start"
                          : index === points.length - 1
                            ? "end"
                            : "middle"
                      }
                      fontSize={10}
                      fill="var(--viz-muted)"
                    >
                      {formatBucket(point.bucket, isMonthly)}
                    </text>
                  );
                })}

              {/* Crosshair + marker */}
              {active && (
                <g>
                  <line
                    x1={active.x}
                    x2={active.x}
                    y1={PAD.top}
                    y2={PAD.top + PLOT_H}
                    stroke="var(--viz-axis)"
                    strokeWidth={1}
                  />
                  {/* 2px surface ring keeps the marker legible where it sits on
                      the line. */}
                  <circle
                    cx={active.x}
                    cy={active.y}
                    r={5}
                    fill="var(--viz-series-1)"
                    stroke="var(--viz-surface)"
                    strokeWidth={2}
                  />
                </g>
              )}
            </svg>

            {active && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2 py-1 text-xs shadow-sm"
                style={{
                  left: `${(active.x / WIDTH) * 100}%`,
                  top: `${(active.y / HEIGHT) * 100}%`,
                }}
              >
                <div className="font-medium">
                  {formatBucket(active.bucket, isMonthly)}
                </div>
                <div className="text-muted-foreground">
                  {active.words.toLocaleString()}{" "}
                  {active.words === 1 ? "word" : "words"}
                  {active.notes > 0 &&
                    ` · ${active.notes} ${active.notes === 1 ? "entry" : "entries"}`}
                </div>
              </div>
            )}
          </div>
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
                {row.words.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
