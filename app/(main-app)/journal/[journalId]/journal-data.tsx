"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { orpc } from "@/lib/orpc.query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Plus } from "lucide-react";
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

  const initialDate = searchParams.get("date")
    ? parseISO(searchParams.get("date") ?? format(new Date(), "yyyy-MM-dd"))
    : new Date();

  const [date, setDate] = useState(initialDate);

  const handleDateChange = (selected: Date | undefined) => {
    if (!selected) return;

    setDate(selected);

    const params = new URLSearchParams(searchParams);

    params.set("date", format(selected, "yyyy-MM-dd"));

    router.replace(`${pathname}?${params.toString()}`);
  };

  const { data, isError } = useSuspenseQuery(
    orpc.journalRouter.getJournalById.queryOptions({
      input: { id, date: format(date, "yyyy-MM-dd") },
    }),
  );

  if (!data) return notFound();

  if (isError) {
    return <p>Something went wrong</p>;
  }

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
              className="p-0 [--cell-size:--spacing(9.5)] w-full"
            />
          </CardContent>
        </Card>
        <ScrollArea className="md:col-span-8 rounded-md border">
          <div className="p-4">
            <div className="flex items-center justify-between">
              <h4 className="mb-4 text-sm leading-none font-medium">Notes</h4>
              <Button variant={"secondary"}>
                <Plus />
              </Button>
            </div>
            {data.notes.length === 0 ? (
              <div className="text-sm text-muted-foreground">No notes</div>
            ) : (
              data.notes.map((item) => (
                <Fragment key={item.id}>
                  <div className="text-sm">{item.title}</div>
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
