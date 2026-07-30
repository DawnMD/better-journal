"use client";

import { NoteRowActions } from "@/components/note-row-actions";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { orpc } from "@/lib/orpc.query";
import { clientTimeZone } from "@/lib/timezone";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { format, isToday, parseISO } from "date-fns";
import { Plus } from "lucide-react";
import Link from "next/link";
import {
  notFound,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { Fragment, useState } from "react";

const DAY = "yyyy-MM-dd";
const MONTH = "yyyy-MM";

export const JournalData = ({ id }: { id: string }) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const timeZone = clientTimeZone();

  // Derived on every render, not seeded into useState. The URL is the single
  // source of truth for the selected day, so browser back/forward — which
  // changes the query string without remounting — moves the calendar too.
  const dateParam = searchParams.get("date");
  const date = dateParam ? parseISO(dateParam) : new Date();
  const dateKey = format(date, DAY);
  const dateMonth = format(date, MONTH);

  // Which month the calendar is *showing*, which is genuinely local UI state:
  // paging to March without picking a day should not rewrite the URL. It is
  // stored against the month it was opened from, so that a back/forward jump to
  // a different month invalidates the override instead of stranding the calendar
  // on a stale page.
  const [monthOverride, setMonthOverride] = useState<{
    base: string;
    month: string;
  } | null>(null);

  const visibleMonth =
    monthOverride?.base === dateMonth ? monthOverride.month : dateMonth;

  const showAddNote = isToday(date);

  const handleDateChange = (selected: Date | undefined) => {
    if (!selected) return;

    const params = new URLSearchParams(searchParams);
    params.set("date", format(selected, DAY));

    router.replace(`${pathname}?${params.toString()}`);
  };

  const { data: journal } = useSuspenseQuery(
    orpc.journalRouter.getJournalById.queryOptions({
      input: { id },
    }),
  );

  const { data: notes } = useSuspenseQuery(
    orpc.notesRouter.getAllNotesByIdAndDate.queryOptions({
      input: { journalId: id, date: dateKey, timeZone },
    }),
  );

  // Badge counts come from the server, aggregated in the reader's timezone and
  // bounded to the visible month. Counting client-side from a full note dump is
  // what let the calendar and the note list disagree.
  const { data: noteCountByDay } = useSuspenseQuery(
    orpc.notesRouter.getNoteCountsByMonth.queryOptions({
      input: { journalId: id, month: visibleMonth, timeZone },
    }),
  );

  const { mutate: createNote, isPending: isCreating } = useMutation(
    orpc.notesRouter.createNote.mutationOptions({
      onSuccess: ({ id: noteId }) => {
        queryClient.invalidateQueries({
          queryKey: orpc.notesRouter.getAllNotesByIdAndDate.queryKey({
            input: { journalId: id, date: dateKey, timeZone },
          }),
        });
        queryClient.invalidateQueries({
          queryKey: orpc.notesRouter.getNoteCountsByMonth.queryKey({
            input: { journalId: id, month: visibleMonth, timeZone },
          }),
        });
        router.push(`/journal/${id}/${noteId}`);
      },
    }),
  );

  // useSuspenseQuery throws on failure rather than returning isError, so the
  // only reachable branch here is a journal that does not exist or is not ours.
  // Query failures are handled by the nearest error.tsx boundary.
  if (!journal) return notFound();

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {journal.title}
        </h1>
        {journal.description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {journal.description}
          </p>
        )}
      </header>
      <div className="grid auto-rows-min gap-4 md:grid-cols-12">
        <Card className="md:col-span-4">
          <CardContent>
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleDateChange}
              month={parseISO(`${visibleMonth}-01`)}
              onMonthChange={(month) =>
                setMonthOverride({ base: dateMonth, month: format(month, MONTH) })
              }
              fixedWeeks
              className="p-0 [--cell-size:--spacing(10)] md:[--cell-size:--spacing(12)] w-full"
              components={{
                DayButton: ({ children, modifiers, day, ...props }) => {
                  const count = noteCountByDay[format(day.date, DAY)] ?? 0;

                  return (
                    <CalendarDayButton
                      day={day}
                      modifiers={modifiers}
                      {...props}
                    >
                      {children}
                      {!modifiers.outside && (
                        <span
                          className={
                            count > 0 ? "text-primary" : "text-muted-foreground"
                          }
                        >
                          {count}
                        </span>
                      )}
                    </CalendarDayButton>
                  );
                },
              }}
            />
          </CardContent>
        </Card>
        <ScrollArea className="md:col-span-8 rounded-md border">
          <div className="p-4">
            <div className="flex items-center justify-between">
              <h4 className="mb-4 text-sm leading-none font-medium">
                Notes for {format(date, "MMMM do, yyyy")}
              </h4>
              {showAddNote && (
                <Button
                  variant={"secondary"}
                  disabled={isCreating}
                  onClick={() => createNote({ journalId: id })}
                >
                  <Plus />
                </Button>
              )}
            </div>
            {notes.length === 0 ? (
              <div className="text-sm text-muted-foreground">No notes</div>
            ) : (
              notes.map((item) => (
                <Fragment key={item.id}>
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/journal/${id}/${item.id}`}
                      className="text-sm hover:underline"
                    >
                      {item.title}
                    </Link>
                    <NoteRowActions
                      noteId={item.id}
                      title={item.title ?? ""}
                      journalId={id}
                      dateKey={dateKey}
                      month={visibleMonth}
                      timeZone={timeZone}
                    />
                  </div>
                  <Separator className="my-2" />
                </Fragment>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};
