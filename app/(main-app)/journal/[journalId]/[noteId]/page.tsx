import { HydrateClient } from "@/components/hydration";
import { NoteEditior } from "@/components/note-editor";
import { orpc } from "@/lib/orpc.query";
import { getQueryClient } from "@/lib/query/get-query-client";

export default async function NotePage({
  params,
}: PageProps<"/journal/[journalId]/[noteId]">) {
  const { noteId } = await params;
  const queryClient = getQueryClient();

  queryClient.prefetchQuery(
    orpc.notesRouter.getNoteById.queryOptions({
      input: {
        noteId: noteId,
      },
    }),
  );

  return (
    <HydrateClient client={queryClient}>
      <NoteEditior noteId={noteId} />
    </HydrateClient>
  );
}
