"use client";

import { orpc } from "@/lib/orpc.query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { NotEditorContent } from "./note-editor-content";

export const NoteEditior = ({ noteId }: { noteId: string }) => {
  const { data, isError } = useSuspenseQuery(
    orpc.notesRouter.getNoteById.queryOptions({
      input: {
        noteId,
      },
    }),
  );

  if (isError) {
    return <div>Something went wrong</div>;
  }

  return (
    <div>
      <NotEditorContent key={data.id} note={data} />
    </div>
  );
};
