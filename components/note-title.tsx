"use client";

import { orpc } from "@/lib/orpc.query";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Inline-editable note title.
 *
 * A button that swaps to an input, rather than a permanently-live text field: the
 * title is read far more often than it is changed, and an always-editable input
 * next to a rich-text editor invites accidental edits.
 *
 * The edit buffer is stored *with the title it was opened against* rather than
 * synced from the prop in an effect. That keeps the prop authoritative without a
 * setState-in-effect cascade, and means a rename arriving from elsewhere (the
 * journal list, another tab) discards a stale in-progress edit instead of
 * silently fighting it.
 */
export const NoteTitle = ({
  noteId,
  title,
}: {
  noteId: string;
  title: string;
}) => {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [edit, setEdit] = useState<{ base: string; draft: string } | null>(
    null,
  );

  // An edit opened against a title that has since changed is stale, so it is
  // simply not active any more.
  const active = edit?.base === title ? edit : null;
  const draft = active?.draft ?? title;

  const { mutate: renameNote, isPending } = useMutation(
    orpc.notesRouter.renameNote.mutationOptions({
      onSuccess: ({ title: nextTitle }) => {
        queryClient.setQueryData(
          orpc.notesRouter.getNoteById.queryKey({ input: { noteId } }),
          (prev) => (prev ? { ...prev, title: nextTitle } : prev),
        );
        // The journal's calendar is keyed by visible range and timezone, neither
        // of which this component knows, so match the procedure broadly and let
        // React Query refetch whichever grid is on screen.
        queryClient.invalidateQueries({
          queryKey: orpc.notesRouter.getNotesInRange.key(),
        });
        setEdit(null);
      },
      onError: (error) => {
        toast.error(error.message);
        setEdit(null);
      },
    }),
  );

  const commit = () => {
    const trimmed = draft.trim();

    if (!trimmed || trimmed === title) {
      setEdit(null);
      return;
    }

    renameNote({ noteId, title: trimmed });
  };

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => {
          setEdit({ base: title, draft: title });
          // Select once the input has replaced this button.
          requestAnimationFrame(() => inputRef.current?.select());
        }}
        className={cn(
          "-mx-1 mb-3 block w-[calc(100%+0.5rem)] truncate rounded-sm px-1 py-0.5 text-left",
          // Display size, and the same serif the body below is set in. The
          // negative margin cancels the padding so the title's first letter sits
          // on the same optical line as the prose, rather than 4px inside it.
          "font-serif text-[34px] leading-[1.15] tracking-tight sm:text-[38px]",
          "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        )}
        title="Click to rename"
      >
        {title || "Untitled note"}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      disabled={isPending}
      maxLength={200}
      autoFocus
      onChange={(event) =>
        setEdit({ base: title, draft: event.target.value })
      }
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setEdit(null);
        }
      }}
      aria-label="Note title"
      className={cn(
        // Same box as the button it swaps with, so committing a rename does not
        // shift the title by a pixel.
        "-mx-1 mb-3 block w-[calc(100%+0.5rem)] rounded-sm bg-transparent px-1 py-0.5",
        "font-serif text-[34px] leading-[1.15] tracking-tight sm:text-[38px]",
        "border-b border-border focus-visible:outline-none",
      )}
    />
  );
};
