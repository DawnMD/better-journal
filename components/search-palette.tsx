"use client";

import { TagChip } from "@/components/tags/tag-chip";
import {
  Command,
  CommandDialog,
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

  // Component state, not the URL. The palette is mounted once in the app layout
  // and opens over whatever page you are on, so writing a facet into the address
  // bar would rewrite the URL of a page that has nothing to do with it.
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

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

  // No `searchTags` procedure: getAllTags is one indexed query returning a
  // bounded list, this palette already filters client-side (`shouldFilter`
  // is off), and sharing the cache entry with the editor combobox, the calendar
  // filter bar and the tag manager means it is usually already warm.
  const { data: allTags } = useQuery({
    ...orpc.tagRouter.getAllTags.queryOptions(),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  // Sorted so that picking A then B hits the same cache entry as B then A — the
  // oRPC query key is structural, so the array's order is part of it. Sent as
  // `undefined` rather than `[]` for the same reason: they are different keys.
  const sortedTagIds = [...selectedTagIds].sort();
  const hasTags = sortedTagIds.length > 0;

  const { data: results, isFetching } = useQuery({
    ...orpc.searchRouter.search.queryOptions({
      input: {
        query: debouncedQuery,
        tagIds: hasTags ? sortedTagIds : undefined,
        limit: 20,
      },
    }),
    // The procedure rejects an empty query *with no tags*, so either one is
    // enough to ask.
    enabled: debouncedQuery.length > 0 || hasTags,
    // Results are stable for a given query; no need to refetch on reopen.
    staleTime: 30_000,
  });

  // Kept in the order they were picked, not alphabetical, so the chip Backspace
  // removes is the one visually last. `sortedTagIds` above is a separate copy
  // precisely so the cache key can be order-independent while the display is not.
  const selectedTags = selectedTagIds.flatMap(
    (id) => (allTags ?? []).find((tag) => tag.id === id) ?? [],
  );

  const tagMatches = (allTags ?? [])
    .filter(
      (tag) =>
        !selectedTagIds.includes(tag.id) &&
        tag.name.includes(debouncedQuery.toLowerCase()),
    )
    .slice(0, 5);

  const addTag = (tagId: string) => {
    setSelectedTagIds((previous) =>
      previous.includes(tagId) ? previous : [...previous, tagId],
    );
    // The text was how the facet was *found*, not part of what is being searched
    // for — so it goes once the facet is pinned. This is what the router's
    // empty-query relaxation exists for.
    setQuery("");
  };

  const removeTag = (tagId: string) =>
    setSelectedTagIds((previous) => previous.filter((id) => id !== tagId));

  const select = (journalId: string, noteId: string) => {
    setOpen(false);
    setQuery("");
    setSelectedTagIds([]);
    router.push(`/journal/${journalId}/${noteId}`);
  };

  // While the debounce is still settling, keep showing the previous results
  // rather than flashing "No notes found" between keystrokes.
  const isSettling = query.trim() !== debouncedQuery;
  const isAsking = debouncedQuery.length > 0 || hasTags;
  const showEmpty = isAsking && !isFetching && !isSettling && !results?.length;

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
          placeholder={
            hasTags ? "Narrow it down..." : "Search your notes..."
          }
          value={query}
          onValueChange={setQuery}
          onKeyDown={(event) => {
            // Backspace on an empty input drops the last chip — the convention
            // every tokenised input follows, and the only way to undo a pick
            // without reaching for the mouse.
            if (event.key === "Backspace" && query.length === 0 && hasTags) {
              event.preventDefault();
              removeTag(selectedTagIds[selectedTagIds.length - 1]!);
            }
          }}
        />

        {/* A plain div inside Command, not a CommandItem: cmdk only manages
            descendants of CommandList, so this row is inert as far as its
            keyboard navigation is concerned. */}
        {selectedTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 px-3 pt-2">
            {selectedTags.map((tag) => (
              <TagChip
                key={tag.id}
                name={tag.name}
                size="sm"
                onRemove={() => removeTag(tag.id)}
              />
            ))}
          </div>
        )}

        <CommandList>
          {!isAsking && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Type to search, or pick a tag.
            </div>
          )}

          {tagMatches.length > 0 && (
            <CommandGroup heading="Tags">
              {tagMatches.map((tag) => (
                <CommandItem
                  // Prefixed so a tag id can never collide with a note id in
                  // the results below — cmdk requires values to be unique.
                  key={tag.id}
                  value={`tag:${tag.id}`}
                  onSelect={() => addTag(tag.id)}
                >
                  <TagChip name={tag.name} size="sm" />
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {tag.noteCount}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* A plain div rather than CommandEmpty: cmdk only renders its Empty
              when the list has no items at all, so with a "Tags" group on
              screen the message would be swallowed exactly when a tag filter
              has matched nothing — the case most in need of an explanation. */}
          {showEmpty && (
            <div className="py-6 text-center text-sm">
              {hasTags && debouncedQuery.length === 0
                ? "No notes with those tags."
                : "No notes found."}
            </div>
          )}

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

          {(isFetching || isSettling) && isAsking && (
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
