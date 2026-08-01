"use client";

import { CreateJournalDialog } from "@/components/create-journal-dialog";
import { JournalSwitcher } from "@/components/shell/journal-switcher";
import { SaveIndicator } from "@/components/shell/save-indicator";
import { UserMenu } from "@/components/shell/user-menu";
import { openSearchPalette } from "@/components/search-palette";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/lib/orpc.query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, PenLineIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The signed-in shell, in 56 pixels.
 *
 * This replaces a 16rem icon-collapsible sidebar. The sidebar earns its keep when
 * the content is a tree you browse constantly; here there are five destinations,
 * ⌘K is already mounted globally, and the real browse surface is the calendar —
 * so the column was paying 256px on every screen, including the note editor,
 * which is the one screen this app exists for.
 *
 * One component and one layout for both states. On a note, the left cluster
 * becomes a back link and the note's title instead of the wordmark and switcher;
 * everything else keeps its slot, so nothing moves under the pointer when you
 * open an entry. That is also why there is no route group for the editor: a
 * second layout would be a second thing to keep in sync for one swapped cluster.
 */
export function AppTopbar() {
  const params = useParams<{ journalId?: string; noteId?: string }>();

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md supports-backdrop-blur:bg-background/65">
      <div className="mx-auto flex h-14 w-full max-w-[110rem] items-center gap-2 px-4 sm:gap-3 sm:px-6">
        {params.noteId ? (
          <NoteBar journalId={params.journalId} noteId={params.noteId} />
        ) : (
          <BrowseBar />
        )}
      </div>
    </header>
  );
}

/** The default state: where you are, and the three things you do most. */
function BrowseBar() {
  return (
    <>
      <Link
        href="/dashboard"
        className="shrink-0 rounded-sm font-serif text-[15px] font-medium tracking-tight focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Better&nbsp;Journal
      </Link>

      {/* Retired with the sidebar: a BrainCircuit mark. A brain-circuit icon is
          AI-app iconography, and the AI features came out in ba0a7af — so it was
          advertising something the app no longer does. A wordmark set in the
          same serif as the entries needs no icon at all. */}
      <span aria-hidden className="shrink-0 text-border select-none">
        /
      </span>

      <JournalSwitcher />

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <SearchButton />
        <NewEntryButton />
        <UserMenu />
      </div>
    </>
  );
}

/**
 * The quiet state, on `/journal/[journalId]/[noteId]`.
 *
 * The titles come from `useQuery`, deliberately *not* the `useSuspenseQuery` the
 * editor uses against this same key. This bar lives in the layout, above
 * `[noteId]/error.tsx`, so a note that fails to load has to degrade to a fallback
 * label here instead of throwing the whole shell into an error boundary — the
 * exact reasoning the breadcrumb this replaced was built on. It is also why the
 * note not-found page still renders under a working top bar.
 */
function NoteBar({
  journalId,
  noteId,
}: {
  journalId?: string;
  noteId: string;
}) {
  const { data: journals, isPending: journalsPending } = useQuery(
    orpc.journalRouter.getAllJournal.queryOptions(),
  );

  const { data: note, isPending: notePending } = useQuery(
    orpc.notesRouter.getNoteById.queryOptions({ input: { noteId } }),
  );

  const journal = journals?.find((item) => item.id === journalId);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        className="h-8 min-w-0 shrink-0 gap-1.5 px-2 font-normal text-muted-foreground hover:text-foreground"
        render={<Link href={journalId ? `/journal/${journalId}` : "/dashboard"} />}
      >
        <ArrowLeftIcon className="size-3.5 shrink-0" />
        {journalsPending ? (
          <Skeleton className="h-3.5 w-20" />
        ) : (
          <span className="hidden max-w-40 truncate sm:inline">
            {journal?.title ?? "Back"}
          </span>
        )}
      </Button>

      <span aria-hidden className="shrink-0 text-border select-none">
        /
      </span>

      {notePending ? (
        <Skeleton className="h-4 w-32" />
      ) : (
        <span className="min-w-0 truncate font-serif text-[15px]">
          {note?.title || "Untitled note"}
        </span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        {/* The autosave state, where the per-save toast used to be. */}
        <SaveIndicator className="hidden sm:inline" />
        <SearchButton />
        <UserMenu />
      </div>
    </>
  );
}

/**
 * ⌘K, for the pointer.
 *
 * The palette itself is mounted once in the layout and listens on `window`, so
 * this is a `dispatchEvent` rather than lifted state — see search-palette.tsx.
 * The shortcut is spelled out on wide screens because a search affordance that
 * only teaches its own shortcut by being hovered teaches it to nobody.
 */
function SearchButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={openSearchPalette}
      aria-label="Search notes"
      className="h-8 gap-2 px-2 font-normal text-muted-foreground hover:text-foreground sm:px-2.5"
    >
      <SearchIcon className="size-4" />
      <kbd className="hidden font-mono text-[11px] tracking-wide md:inline">
        ⌘K
      </kbd>
    </Button>
  );
}

/**
 * Write something, from anywhere.
 *
 * `createNote` stamps `createdAt` server-side, so a new entry always lands on
 * today and always opens straight into the editor — which means, unlike the
 * calendar's own "New note", this one has no wrong moment to be pressed and
 * needs no `canCreate` rule.
 *
 * The target is the journal you are looking at, or your first one if you are on
 * a page that names none. With no journals at all there is nothing to write in,
 * so the button offers the thing that has to happen first instead of failing.
 */
function NewEntryButton() {
  const params = useParams<{ journalId?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [creatingJournal, setCreatingJournal] = useState(false);

  const { data: journals } = useQuery(
    orpc.journalRouter.getAllJournal.queryOptions(),
  );

  const target = params.journalId ?? journals?.[0]?.id;

  const { mutate: createNote, isPending } = useMutation(
    orpc.notesRouter.createNote.mutationOptions({
      onSuccess: ({ id: noteId }, variables) => {
        // Matched broadly: the calendar's key carries the visible range and the
        // reader's timezone, neither of which this button knows.
        queryClient.invalidateQueries({
          queryKey: orpc.notesRouter.getNotesInRange.key(),
        });
        router.push(`/journal/${variables.journalId}/${noteId}`);
      },
    }),
  );

  return (
    <>
      <Button
        size="sm"
        disabled={isPending}
        className="h-8 gap-1.5 px-2 sm:px-3"
        onClick={() => {
          if (target) createNote({ journalId: target });
          else setCreatingJournal(true);
        }}
      >
        <PenLineIcon className="size-3.5" />
        <span className="hidden sm:inline">New entry</span>
        <span className="sr-only sm:hidden">New entry</span>
      </Button>

      <CreateJournalDialog
        open={creatingJournal}
        onOpenChange={setCreatingJournal}
      />
    </>
  );
}
