import { HydrateClient } from "@/components/hydration";
import { JournalData } from "@/components/journal-data";
import { rangeKeys, resolveDayKey, resolveView } from "@/lib/calendar";
import { orpc } from "@/lib/orpc.query";
import { getQueryClient } from "@/lib/query/get-query-client";
import { serverTimeZone } from "@/lib/timezone.server";
import { dayKeyInTimeZone } from "@/lib/timezone";
import { parseISO } from "date-fns";
import { notFound } from "next/navigation";

export default async function JournalIdPage({
  params,
  searchParams,
}: PageProps<"/journal/[journalId]">) {
  const { journalId } = await params;
  const { date, view: viewParam } = (await searchParams) as {
    date?: string;
    view?: string;
  };

  // Read from the tz cookie so these prefetches build the same query keys the
  // client will. See lib/timezone.server.ts for why this is best-effort.
  const timeZone = await serverTimeZone();

  // "Today" in the reader's zone rather than the server's. On Vercel the server
  // is UTC, so `new Date()` there would default a reader in Kiritimati to
  // yesterday — a prefetch for the wrong grid, and a first paint the client then
  // has to correct.
  const today = dayKeyInTimeZone(new Date(), timeZone);

  // Both params are narrowed here as well as on the client, so a hand-edited
  // query string opens on today rather than 500ing out of `format`.
  const view = resolveView(viewParam);
  const selected = resolveDayKey(date, today);

  // The grid's extent is computed by the same function the client calls. Two
  // implementations of "which days are on screen" would differ by an off-by-one
  // somewhere and turn every first paint into a cache miss.
  const range = rangeKeys(parseISO(selected), view);

  const queryClient = getQueryClient();

  // Started before the existence check below so both round trips overlap.
  // prefetchQuery swallows its own failures, so if the journal turns out not to
  // resolve this just goes nowhere — the 404 is decided by the awaited query.
  const prefetching = queryClient.prefetchQuery(
    orpc.notesRouter.getNotesInRange.queryOptions({
      input: { journalId, ...range, timeZone },
    }),
  );

  // Awaited, unlike the one above: an id that does not resolve has to become a
  // real 404 — status code and all — here on the server. Prefetching it instead
  // would hand the browser a page that only discovers the journal is gone once
  // the client re-runs the query, by which point the best it can do is an error
  // boundary. The result is still cached, so the client query below is free.
  const journal = await queryClient.fetchQuery(
    orpc.journalRouter.getJournalById.queryOptions({
      input: { id: journalId },
    }),
  );

  if (!journal) notFound();

  // Awaited only now, so the range lands in the dehydrated state rather than
  // racing it. Failure here is not fatal — the client refetches.
  await prefetching;

  return (
    <HydrateClient client={queryClient}>
      <JournalData id={journalId} serverToday={today} />
    </HydrateClient>
  );
}
