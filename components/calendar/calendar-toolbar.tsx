"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CALENDAR_VIEWS, type CalendarView } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";

const VIEW_LABEL: Record<CalendarView, string> = {
  month: "Month",
  week: "Week",
  day: "Day",
};

/**
 * The bar above the grid: where you are, how to move, and what you are looking at.
 *
 * Purely presentational — every control reports upward and the URL decides what
 * actually changes, so back/forward moves the calendar the same way the buttons
 * do.
 */
export const CalendarToolbar = ({
  title,
  view,
  isOnToday,
  canCreate,
  isCreating,
  onShift,
  onToday,
  onViewChange,
  onCreate,
}: {
  title: string;
  view: CalendarView;
  /** Whether the selected day *is* today, not merely whether today is on screen. */
  isOnToday: boolean;
  canCreate: boolean;
  isCreating: boolean;
  onShift: (direction: 1 | -1) => void;
  onToday: () => void;
  onViewChange: (view: CalendarView) => void;
  onCreate: () => void;
}) => {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onShift(-1)}
          aria-label={`Previous ${view}`}
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onShift(1)}
          aria-label={`Next ${view}`}
        >
          <ChevronRightIcon />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="ml-1"
          // Disabled only when today is already the selected day, not merely
          // somewhere on screen: from a month grid showing this month, "Today"
          // still has work to do.
          disabled={isOnToday}
          onClick={onToday}
        >
          Today
        </Button>
      </div>

      {/* aria-live so a screen reader hears the new range after paging, which is
          otherwise a silent change to a grid it is not focused on. */}
      <h2
        className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight"
        aria-live="polite"
      >
        {title}
      </h2>

      <div
        role="group"
        aria-label="Calendar view"
        className="flex items-center rounded-lg border p-0.5"
      >
        {CALENDAR_VIEWS.map((option) => (
          <Button
            key={option}
            size="sm"
            variant="ghost"
            aria-pressed={option === view}
            className={cn(
              "px-2.5",
              option === view && "bg-muted text-foreground",
            )}
            onClick={() => onViewChange(option)}
          >
            {VIEW_LABEL[option]}
          </Button>
        ))}
      </div>

      {/* Shown but inert off today, rather than hidden. `createNote` stamps
          `createdAt` server-side, so a note always lands on today — a button that
          vanished when you paged back would look like a bug rather than a rule.

          `aria-disabled` and a guarded handler, not the `disabled` attribute: a
          truly disabled button receives no pointer events, so the tooltip that
          explains *why* it is unavailable would never open. */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="sm"
              disabled={isCreating}
              aria-disabled={!canCreate}
              className="aria-disabled:opacity-50"
              onClick={() => canCreate && onCreate()}
            >
              <PlusIcon />
              New note
            </Button>
          }
        />
        <TooltipContent>
          {canCreate
            ? "Add a note to today"
            : "Notes are always written on today — jump to Today first"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
