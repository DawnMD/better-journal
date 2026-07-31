"use client";

import {
  activityLevel,
  LEVEL_VAR,
} from "@/components/dashboard/viz-tokens";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDate, formatNumber } from "@/lib/format";
import { orpc } from "@/lib/orpc.query";
import { clientTimeZone } from "@/lib/timezone";
import { useSuspenseQuery } from "@tanstack/react-query";
import { TableIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

/**
 * GitHub-style contribution heatmap.
 *
 * A heatmap is the right form here — the job is "compare magnitude across a grid"
 * — so the color job is sequential: one hue, light→dark, never a rainbow. The
 * ramp is validated — see the token block in app/globals.css.
 *
 * Counts are binned into five steps rather than mapped continuously: past about
 * seven classes adjacent shades stop being distinguishable, so extra precision
 * would be a lie. The exact number lives in the tooltip and the table view.
 */

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

type Day = {
  key: string;
  date: Date;
  count: number;
  words: number;
};

/**
 * The year laid out as columns of weeks.
 *
 * Built from local date parts rather than UTC so the grid's idea of "which weekday
 * is this" matches the timezone the counts were bucketed in.
 */
function buildWeeks(year: number, byDay: Record<string, { count: number; words: number }>) {
  const weeks: (Day | null)[][] = [];

  const first = new Date(year, 0, 1);
  const last = new Date(year, 11, 31);

  // Pad so every column is a full Sun–Sat week.
  let current: (Day | null)[] = Array.from<null>({ length: first.getDay() }).fill(
    null,
  );

  for (
    const cursor = new Date(first);
    cursor <= last;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    const entry = byDay[key];

    current.push({
      key,
      date: new Date(cursor),
      count: entry?.count ?? 0,
      words: entry?.words ?? 0,
    });

    if (current.length === 7) {
      weeks.push(current);
      current = [];
    }
  }

  if (current.length > 0) {
    while (current.length < 7) current.push(null);
    weeks.push(current);
  }

  return weeks;
}

export const ActivityHeatmap = () => {
  const timeZone = clientTimeZone();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [showTable, setShowTable] = useState(false);

  const { data } = useSuspenseQuery(
    orpc.statsRouter.getActivity.queryOptions({ input: { year, timeZone } }),
  );

  const weeks = useMemo(
    () => buildWeeks(year, data.byDay),
    [year, data.byDay],
  );

  const activeDays = Object.entries(data.byDay);
  const total = activeDays.reduce((sum, [, v]) => sum + v.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Writing activity</CardTitle>
        <CardDescription>
          {total === 0
            ? `No entries in ${year}`
            : `${formatNumber(total)} ${total === 1 ? "entry" : "entries"} across ${activeDays.length} ${activeDays.length === 1 ? "day" : "days"} in ${year}`}
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setYear((y) => y - 1)}
            aria-label={`Show ${year - 1}`}
          >
            {year - 1}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={year >= new Date().getFullYear()}
            onClick={() => setYear((y) => y + 1)}
            aria-label={`Show ${year + 1}`}
          >
            {year + 1}
          </Button>
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
          <ActivityTable days={activeDays} />
        ) : (
          <div className="overflow-x-auto">
            {/* Week columns share the width evenly and the cells are square, so
                the grid fills the card instead of sitting at a fixed size. Below
                the min-width the cells would shrink past a usable target, so it
                scrolls from there rather than shrinking further. */}
            <div className="flex min-w-[640px] gap-2 pb-1">
              {/* Weekday gutter. Only alternate rows are labelled — seven labels
                  in a grid this fine is unreadable. The rows stretch to the
                  cell grid's height, which keeps the labels on their rows at
                  any cell size. */}
              <div
                className="grid shrink-0 grid-rows-7 gap-[3px] pt-5 text-[10px] text-muted-foreground"
                aria-hidden
              >
                {WEEKDAY_LABELS.map((label, index) => (
                  <div key={index} className="flex items-center leading-none">
                    {label}
                  </div>
                ))}
              </div>

              <div className="min-w-0 flex-1">
                <MonthAxis weeks={weeks} />
                <div className="flex gap-[3px]">
                  {weeks.map((week, weekIndex) => (
                    <div
                      key={weekIndex}
                      className="flex min-w-0 flex-1 flex-col gap-[3px]"
                    >
                      {week.map((day, dayIndex) =>
                        day ? (
                          <DayCell key={day.key} day={day} />
                        ) : (
                          // Padding before Jan 1 / after Dec 31.
                          <div
                            key={`${weekIndex}-${dayIndex}`}
                            className="aspect-square w-full"
                          />
                        ),
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <Legend />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * One day.
 *
 * The cell sizes itself off the column width, and the hover/focus target is the
 * whole button including its gap. It is keyboard-focusable — a tooltip must
 * never be the only way to reach a value, and pinpoint targets fail that in
 * practice.
 */
function DayCell({ day }: { day: Day }) {
  const level = activityLevel(day.count);

  // Pinned locale, not the ambient one. This lands in an `aria-label`, and React
  // checks attributes on hydration just as strictly as text — a server on `en-IN`
  // writing "Friday, 31 July 2026" against a browser on `en-US` is a mismatch.
  const label = `${formatDate(day.date, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })}: ${day.count === 0 ? "no entries" : `${day.count} ${day.count === 1 ? "entry" : "entries"}, ${formatNumber(day.words)} words`}`;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className="aspect-square w-full rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ backgroundColor: LEVEL_VAR[level] }}
          />
        }
      />
      <TooltipContent>
        <span className="text-xs">{label}</span>
      </TooltipContent>
    </Tooltip>
  );
}

/** Month labels above the first week whose Sunday starts that month. */
function MonthAxis({ weeks }: { weeks: (Day | null)[][] }) {
  const labels: { index: number; month: number }[] = [];
  let lastMonth = -1;

  weeks.forEach((week, index) => {
    const firstDay = week.find(Boolean);
    if (!firstDay) return;

    const month = firstDay.date.getMonth();
    if (month !== lastMonth) {
      labels.push({ index, month });
      lastMonth = month;
    }
  });

  return (
    <div className="relative mb-1 h-4 text-[10px] text-muted-foreground" aria-hidden>
      {labels.map((label) => (
        <span
          key={label.month}
          className="absolute top-0"
          // Percentage, not pixels: the week columns are now width-derived, so
          // a fixed per-column offset would drift off its month.
          style={{ left: `${(label.index / weeks.length) * 100}%` }}
        >
          {MONTH_LABELS[label.month]}
        </span>
      ))}
    </div>
  );
}

/** The scale legend a sequential encoding always needs. */
function Legend() {
  return (
    <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
      <span>Less</span>
      {LEVEL_VAR.map((color, index) => (
        <span
          key={index}
          className="size-[11px] rounded-[2px]"
          style={{ backgroundColor: color }}
          aria-hidden
        />
      ))}
      <span>More</span>
    </div>
  );
}

/**
 * The table twin.
 *
 * Every chart needs a non-color path to its values — this one lists only the days
 * with activity, since 365 rows of "0 entries" would bury them.
 */
function ActivityTable({
  days,
}: {
  days: [string, { count: number; words: number }][];
}) {
  if (days.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No entries this year.
      </p>
    );
  }

  return (
    <div className="max-h-72 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 font-medium">Date</th>
            <th className="py-2 text-right font-medium">Entries</th>
            <th className="py-2 text-right font-medium">Words</th>
          </tr>
        </thead>
        <tbody>
          {days.map(([day, value]) => (
            <tr key={day} className="border-b last:border-0">
              <td className="py-1.5">
                <Link
                  href={`/journal?date=${day}`}
                  className="hover:underline"
                >
                  {day}
                </Link>
              </td>
              {/* tabular-nums here, where the digits do align vertically. */}
              <td className="py-1.5 text-right tabular-nums">{value.count}</td>
              <td className="py-1.5 text-right tabular-nums">
                {formatNumber(value.words)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
