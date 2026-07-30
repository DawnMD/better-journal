"use client";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { orpc } from "@/lib/orpc.query";
import { HL_SPLIT } from "@/lib/search";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { FileTextIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useDebounce } from "use-debounce";

/** Dispatch on `window` to open the palette from anywhere. */
export const OPEN_SEARCH_EVENT = "better-journal:open-search";

export function openSearchPalette() {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}

/**
 * ⌘K / Ctrl-K search over every note the user owns.
 *
 * The input is uncontrolled by cmdk's own filter (`shouldFilter={false}`): ranking
 * is done by Postgres with `ts_rank`, and letting cmdk re-sort the results
 * client-side would throw that ordering away and re-rank on substring matches.
 */
export const SearchPalette = () => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // 200ms is short enough to feel live and long enough that a fast typist does
  // not fire a full-text query per keystroke.
  const [debouncedQuery] = useDebounce(query.trim(), 200);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
    };

    // A window event rather than lifted state or a context: the sidebar button
    // lives in a different subtree, and one event listener is less machinery than
    // a provider threaded through the layout for a single boolean.
    const onOpenRequest = () => setOpen(true);

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpenRequest);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpenRequest);
    };
  }, []);

  const { data: results, isFetching } = useQuery({
    ...orpc.searchRouter.search.queryOptions({
      input: { query: debouncedQuery, limit: 20 },
    }),
    // The procedure rejects an empty query, so do not ask until there is one.
    enabled: debouncedQuery.length > 0,
    // Results are stable for a given query; no need to refetch on reopen.
    staleTime: 30_000,
  });

  const select = (journalId: string, noteId: string) => {
    setOpen(false);
    setQuery("");
    router.push(`/journal/${journalId}/${noteId}`);
  };

  // While the debounce is still settling, keep showing the previous results
  // rather than flashing "No notes found" between keystrokes.
  const isSettling = query.trim() !== debouncedQuery;
  const showEmpty =
    debouncedQuery.length > 0 && !isFetching && !isSettling && !results?.length;

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search notes"
      description="Search across every note in your journals."
      className="sm:max-w-2xl"
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search your notes..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {debouncedQuery.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Type to search your notes.
            </div>
          )}

          {showEmpty && <CommandEmpty>No notes found.</CommandEmpty>}

          {!!results?.length && (
            <CommandGroup
              heading={`${results.length} result${results.length === 1 ? "" : "s"}`}
            >
              {results.map((result) => (
                <CommandItem
                  key={result.id}
                  // cmdk dedupes and matches on `value`; the id keeps it unique
                  // even when two notes share a title.
                  value={result.id}
                  onSelect={() => select(result.journalId, result.id)}
                  className="flex flex-col items-start gap-1 py-2"
                >
                  <div className="flex w-full items-center gap-2">
                    <FileTextIcon className="size-4 shrink-0 opacity-60" />
                    <span className="truncate font-medium">
                      {result.title || "Untitled note"}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {format(result.createdAt, "MMM d, yyyy")}
                    </span>
                  </div>
                  <Snippet
                    snippet={result.snippet}
                    journal={result.journalTitle}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {(isFetching || isSettling) && debouncedQuery.length > 0 && (
            <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
              <Loader2Icon className="size-3 animate-spin" />
              Searching...
            </div>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
};

/**
 * Renders a `ts_headline` snippet, highlighting the matched terms.
 *
 * The snippet is plain text with STX/ETX around each match, so it is split and
 * turned into real elements. No `dangerouslySetInnerHTML`: `ts_headline` does not
 * escape the text it is given, so asking Postgres for `<mark>` and injecting the
 * result as HTML would execute whatever markup a note body happened to contain.
 */
function Snippet({ snippet, journal }: { snippet: string; journal: string }) {
  if (!snippet) {
    return (
      <span className="pl-6 text-xs text-muted-foreground">{journal}</span>
    );
  }

  // Odd-indexed pieces are the matches: "a MATCH b" splits to ["a ", "MATCH", " b"].
  const pieces = snippet.split(HL_SPLIT);

  return (
    <span className="pl-6 text-xs text-muted-foreground">
      <span className="mr-2 opacity-70">{journal}</span>
      {pieces.map((piece, index) =>
        index % 2 === 1 ? (
          <mark
            key={index}
            className="bg-transparent font-medium text-foreground"
          >
            {piece}
          </mark>
        ) : (
          <span key={index}>{piece}</span>
        ),
      )}
    </span>
  );
}
