import { HydrateClient } from "@/components/hydration";
import { NoteEditor } from "@/components/note-editor";
import { isNotFoundError } from "@/lib/orpc.errors";
import { orpc } from "@/lib/orpc.query";
import { getQueryClient } from "@/lib/query/get-query-client";
import { notFound } from "next/navigation";

export default async function NotePage({
  params,
}: PageProps<"/journal/[journalId]/[noteId]">) {
  const { journalId, noteId } = await params;
  const queryClient = getQueryClient();

  // Started before the awaited fetch below so all three round trips overlap.
  // prefetchQuery swallows its own failures, so a note the user does not own
  // just goes nowhere here — the 404 is still decided by the awaited query.
  const prefetching = Promise.all([
    queryClient.prefetchQuery(
      orpc.tagRouter.getTagsForNote.queryOptions({ input: { noteId } }),
    ),
    // The combobox's suggestion list. Shared with the calendar filter bar and
    // the tag manager, so this is usually already warm.
    queryClient.prefetchQuery(orpc.tagRouter.getAllTags.queryOptions()),
  ]);

  // Fetched rather than prefetched so a note that does not resolve becomes a
  // 404 on the server. getNoteById throws NOT_FOUND for a deleted note, someone
  // else's note, or one whose journal is in the trash — all of which are wrong
  // addresses, not failures, and none of which belong in an error boundary.
  let note;

  try {
    note = await queryClient.fetchQuery(
      orpc.notesRouter.getNoteById.queryOptions({
        input: {
          noteId: noteId,
        },
      }),
    );
  } catch (error) {
    if (isNotFoundError(error)) notFound();

    // Anything else — a locked journal, an unreachable database — is a genuine
    // error and belongs to [noteId]/error.tsx.
    throw error;
  }

  // The URL names both the journal and the note, so a real note reached through
  // the wrong journal id is still a wrong address. Without this the note would
  // render under a journal it does not belong to, with a breadcrumb naming that
  // other journal and a "back" link that leads somewhere it was never listed.
  if (note.journalId !== journalId) notFound();

  // Awaited only now, so the tags land in the dehydrated state rather than
  // racing it. Failure here is not fatal — the client refetches.
  await prefetching;

  return (
    <HydrateClient client={queryClient}>
      <NoteEditor noteId={noteId} />
    </HydrateClient>
  );
}
