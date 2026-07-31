"use client";

import { TagChip } from "@/components/tags/tag-chip";
import { TagRowActions } from "@/components/tags/tag-row-actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { orpc } from "@/lib/orpc.query";
import { useSuspenseQuery } from "@tanstack/react-query";

/**
 * Rename and delete the tags the user owns, across every journal.
 *
 * A table rather than a list of chips, matching the trash page: the note count
 * is a real column with a real header, which is what makes "delete this tag,
 * it is on 12 notes" answerable before you click rather than after.
 */
export const TagManager = () => {
  const { data: tags } = useSuspenseQuery(
    orpc.tagRouter.getAllTags.queryOptions(),
  );

  // No isError branch: useSuspenseQuery throws, so a failure is caught by the
  // route's error boundary rather than reported through this hook.

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          Tags
          <span className="text-sm font-normal text-muted-foreground tabular-nums">
            {tags.length}
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Rename or delete the tags you use across every journal.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tag</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tags.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="h-24 text-center">
                No tags yet. Add one from any note.
              </TableCell>
            </TableRow>
          ) : (
            // Rows are deliberately not links. A tag spans journals, but the
            // only place to browse one — the calendar filter — is scoped to a
            // single journal, so there is no correct destination yet.
            // getNotesByTags is the natural backend for that page when it exists.
            tags.map((tag) => (
              <TableRow key={tag.id}>
                <TableCell>
                  <TagChip name={tag.name} />
                </TableCell>
                <TableCell className="tabular-nums">{tag.noteCount}</TableCell>
                <TableCell className="w-0">
                  <TagRowActions
                    tagId={tag.id}
                    name={tag.name}
                    noteCount={tag.noteCount}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};
