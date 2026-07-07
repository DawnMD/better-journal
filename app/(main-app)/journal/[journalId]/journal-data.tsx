"use client";

import { orpc } from "@/lib/orpc.query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { notFound } from "next/navigation";

export const JournalData = ({ id }: { id: string }) => {
  const { data, isError } = useSuspenseQuery(
    orpc.journalRouter.getJournalById.queryOptions({ input: { id } }),
  );

  if (!data) return notFound();

  if (isError) {
    return <p>Something went wrong</p>;
  }

  return <div>{data.title}</div>;
};
