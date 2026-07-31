"use client";

import { TagChip } from "@/components/tags/tag-chip";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { orpc } from "@/lib/orpc.query";
import { MAX_TAG_FILTER } from "@/lib/tags";
import { useQuery } from "@tanstack/react-query";
import { TagsIcon } from "lucide-react";
import { useState } from "react";

/**
 * The calendar's tag filter.
 *
 * Presentational plus its own `getAllTags` query, reporting the selection
 * upward rather than owning it — the model `CalendarToolbar` sets out in its own
 * doc comment. The selection itself belongs in the URL, and only
 * `JournalCalendar` knows how to put it there.
 */
export const TagFilterBar = ({
  selectedTagIds,
  onChange,
}: {
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const { data: allTags } = useQuery(orpc.tagRouter.getAllTags.queryOptions());

  // Chrome for a feature the user has not started using is just noise. The bar
  // appears the moment a first tag exists.
  if (!allTags?.length) return null;

  const selected = new Set(selectedTagIds);
  const selectedTags = allTags.filter((tag) => selected.has(tag.id));
  const atCap = selectedTagIds.length >= MAX_TAG_FILTER;

  const matches = allTags.filter((tag) =>
    tag.name.includes(draft.trim().toLowerCase()),
  );

  const toggle = (tagId: string) => {
    if (selected.has(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId));
      return;
    }

    if (atCap) return;

    onChange([...selectedTagIds, tagId]);
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={<Button variant="outline" size="sm" className="h-7 gap-1.5" />}
        >
          <TagsIcon className="size-3.5" />
          <span className="text-xs">Tags</span>
          {selectedTagIds.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {selectedTagIds.length}
            </span>
          )}
        </PopoverTrigger>

        <PopoverContent align="start" className="w-64 p-0">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Filter tags..."
              value={draft}
              onValueChange={setDraft}
            />
            <CommandList>
              <CommandEmpty>No tags match.</CommandEmpty>
              <CommandGroup>
                {matches.map((tag) => {
                  const isSelected = selected.has(tag.id);

                  return (
                    <CommandItem
                      key={tag.id}
                      value={tag.id}
                      // CommandItem already renders a trailing check driven by
                      // this attribute, so the multi-select affordance is free.
                      data-checked={isSelected}
                      // A tag past the cap would silently do nothing on click.
                      disabled={!isSelected && atCap}
                      onSelect={() => toggle(tag.id)}
                    >
                      <TagChip name={tag.name} size="sm" />
                      <span className="ml-auto pr-1 text-xs text-muted-foreground tabular-nums">
                        {tag.noteCount}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedTags.map((tag) => (
        <TagChip
          key={tag.id}
          name={tag.name}
          onRemove={() => toggle(tag.id)}
        />
      ))}

      {selectedTagIds.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={() => onChange([])}
        >
          Clear
        </Button>
      )}
    </div>
  );
};
