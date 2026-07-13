"use client";

import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { orpc } from "@/lib/orpc.query";
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

export const JournalData = ({ id }: { id: string }) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const initialDate = searchParams.get("date")
    ? parseISO(searchParams.get("date") ?? format(new Date(), "yyyy-MM-dd"))
    : new Date();
  const showAddNote = isToday(initialDate);

  const [date, setDate] = useState(initialDate);

  const handleDateChange = (selected: Date | undefined) => {
    if (!selected) return;

    setDate(selected);

    const params = new URLSearchParams(searchParams);

    params.set("date", format(selected, "yyyy-MM-dd"));

    router.replace(`${pathname}?${params.toString()}`);
  };

  const { data: journal, isError: isJournalError } = useSuspenseQuery(
    orpc.journalRouter.getJournalById.queryOptions({
      input: { id },
    }),
  );

  const { data: notes, isError: isNotesError } = useSuspenseQuery(
    orpc.notesRouter.getAllNotesByIdAndDate.queryOptions({
      input: { journalId: id, date: format(date, "yyyy-MM-dd") },
    }),
  );

  const { mutate } = useMutation(
    orpc.notesRouter.createNote.mutationOptions({
      onSuccess: ({ id: noteId }) => {
        queryClient.invalidateQueries({
          queryKey: orpc.journalRouter.getJournalById.queryKey({
            input: { id },
          }),
        });
        queryClient.invalidateQueries({
          queryKey: orpc.notesRouter.getAllNotesByIdAndDate.queryKey({
            input: { journalId: id, date: format(date, "yyyy-MM-dd") },
          }),
        });
        router.push(`/journal/${id}/${noteId}`);
      },
    }),
  );

  if (!journal) return notFound();

  if (isJournalError || isNotesError) {
    return <p>Something went wrong</p>;
  }

  const noteCountByDay = journal.notes.reduce(
    (acc, note) => {
      const key = format(note.createdAt, "yyyy-MM-dd");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div>
      <div className="grid auto-rows-min gap-4 md:grid-cols-12">
        <Card className="md:col-span-4">
          <CardContent>
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleDateChange}
              fixedWeeks
              className="p-0 [--cell-size:--spacing(10)] md:[--cell-size:--spacing(12)] w-full"
              components={{
                DayButton: ({ children, modifiers, day, ...props }) => {
                  const count =
                    noteCountByDay[format(day.date, "yyyy-MM-dd")] ?? 0;

                  return (
                    <CalendarDayButton
                      day={day}
                      modifiers={modifiers}
                      {...props}
                    >
                      {children}
                      {!modifiers.outside && <span>{count}</span>}
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
              <h4 className="mb-4 text-sm leading-none font-medium">Notes</h4>
              {showAddNote && (
                <Button
                  variant={"secondary"}
                  onClick={() => mutate({ journalId: id })}
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
                  <Link href={`/journal/${id}/${item.id}`} className="text-sm">
                    {item.title}
                  </Link>
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
