"use client";

import { orpc } from "@/lib/orpc.query";
import { useSuspenseQuery } from "@tanstack/react-query";

export const TrashedJournals = () => {
  const { data, isError } = useSuspenseQuery(
    orpc.journalRouter.getTrashedJournal.queryOptions(),
  );

  if (isError) {
    return <p>Something went wrong</p>;
  }

  return (
    <div>
      {data.map((item) => (
        <p key={item.id}>{item.title}</p>
      ))}
    </div>
  );
};
