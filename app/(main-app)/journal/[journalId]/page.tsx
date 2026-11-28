import { auth } from "@clerk/nextjs/server";
import { HydrateClient } from "@/components/hydration";
import { JournalData } from "@/components/journal-data";
import { ReaderZoneProvider } from "@/components/reader-zone";
import { PageContainer } from "@/components/shell/page-container";
import { rangeKeys, resolveDayKey } from "@/lib/calendar";
import { isNotFoundError } from "@/lib/orpc.errors";
import { orpc } from "@/lib/orpc.query";
import { getQueryClient } from "@/lib/query/get-query-client";
import { listNotesOptions } from "@/lib/query/list-notes";
import { ownedTagIds, resolveTagIds } from "@/lib/tags";
import { readerCalendarFromCookie } from "@/server/lib/reader-calendar";
import { parseISO } from "date-fns";
import { notFound } from "next/navigation";

export default async function JournalIdPage({
  params,
  searchParams,
}: PageProps<"/journal/[journalId]">) {
  await auth.protect();

  const { journalId } = await params;
  const { date, tags } = (await searchParams) as {
    date?: string;
    tags?: string;
  };

  // Read from the tz cookie so these prefetches build the same query keys the
  // client will. See readerCalendarFromCookie for why this is best-effort.
  const calendar = await readerCalendarFromCookie();
  const timeZone = calendar.zone;

  // "Today" in the reader's zone rather than the server's. On Vercel the server
  // is UTC, so `new Date()` there would default a reader in Kiritimati to
  // yesterday — a prefetch for the wrong month, and a first paint the client
  // then has to correct.
  const today = calendar.today();

  // Narrowed here exactly as JournalBrowser narrows it, so a hand-edited query
  // string opens the newest notes rather than 500ing out of `format`, and both
  // sides build the same list key.
  const anchor = resolveDayKey(date, "") || undefined;

  const queryClient = getQueryClient();

  // Started before the existence check below so the round trips overlap.
  // Prefetches swallow their own failures, so if the journal turns out not to
  // resolve these just go nowhere — the 404 is decided by the awaited query.
  const prefetching = (async () => {
    // The tags first: the list is asked for with only the reader's own tag
    // ids, so which of `?tags=` survive has to be known before its key is.
    // Called with no argument, exactly as the client calls it — `getAllTags`
    // takes `z.void()`, and `.queryOptions({})` would not necessarily hash to
    // the same key as `.queryOptions()`.
    const allTags = await queryClient
      .fetchQuery(orpc.tagRouter.getAllTags.queryOptions())
      .catch(() => null);
    if (!allTags) return;

    const tagIds = ownedTagIds(resolveTagIds(tags), allTags);

    await Promise.all([
      queryClient.prefetchInfiniteQuery(
        listNotesOptions({ journalId, timeZone, anchor, tagIds }),
      ),
      // The calendar's first month — the same range the client derives.
      queryClient.prefetchQuery(
        orpc.notesRouter.getNotesInRange.queryOptions({
          input: {
            journalId,
            ...rangeKeys(parseISO(anchor ?? today)),
            timeZone,
          },
        }),
      ),
    ]);
  })();

  // Awaited, unlike the one above: an id that does not resolve has to become a
  // real 404 — status code and all — here on the server. Prefetching it instead
  // would hand the browser a page that only discovers the journal is gone once
  // the client re-runs the query. The result is still cached, so the client
  // query below is free.
  try {
    await queryClient.fetchQuery(
      orpc.journalRouter.getJournalById.queryOptions({
        input: { id: journalId },
      }),
    );
  } catch (error) {
    // getJournalById throws NOT_FOUND for a missing journal, someone else's, or
    // one in the trash — wrong addresses, not failures.
    if (isNotFoundError(error)) notFound();

    // Anything else is a genuine error and belongs to [journalId]/error.tsx.
    throw error;
  }

  // Awaited only now, so the list and the month land in the dehydrated state rather than
  // racing it. Failure here is not fatal — the client refetches.
  await prefetching;

  return (
    <HydrateClient client={queryClient}>
      {/* Seeded per page, not in the (main-app) layout: a cookie read in a
          layout would make the whole app shell dynamic. The same zone the
          prefetch above was keyed on, so the calendar's first paint matches. */}
      <ReaderZoneProvider initialZone={timeZone}>
        <PageContainer width="wide">
          <JournalData id={journalId} />
        </PageContainer>
      </ReaderZoneProvider>
    </HydrateClient>
  );
}
