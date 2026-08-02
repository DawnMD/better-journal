"use client";

import { EmptyState } from "@/components/empty-state";
import { columns } from "@/components/trash-columns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTimeZone } from "@/components/use-time-zone";
import { formatDateTimeInZone } from "@/lib/format";
import { orpc } from "@/lib/orpc.query";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Fragment, useState } from "react";

export const TrashedJournalTable = ({
  serverTimeZone,
}: {
  /** The `tz` cookie's zone, used only until the browser reports its own. */
  serverTimeZone: string;
}) => {
  const { data } = useSuspenseQuery(
    orpc.journalRouter.getTrashedJournal.queryOptions(),
  );

  // "Deleted at 4:22 AM" for a journal emptied at 9:52 IST, otherwise: this
  // table is server-rendered, and `format()` would read the server's zone.
  const timeZone = useTimeZone(serverTimeZone);

  const [expanded, setExpanded] = useState<ExpandedState>({});

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    onExpandedChange: setExpanded,

    getRowCanExpand: ({ original }) => !!original.notes.length,

    state: { expanded },
  });

  // No isError branch: useSuspenseQuery throws, so a failure is caught by the
  // error.tsx boundary rather than reported through this hook's return value.

  return (
    <div className="flex flex-col gap-6">
      {/* The page had no heading of its own — it opened straight onto a bare
          table, which only reads as "Trash" if you remember clicking Trash. */}
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-3xl tracking-tight">Trash</h1>
        <p className="text-sm text-muted-foreground">
          Journals you removed, and everything that was written in them. Restore
          one and its entries come back with it.
        </p>
      </div>

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <Fragment key={row.id}>
                <TableRow data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>

                {row.getIsExpanded() && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={row.getVisibleCells().length}>
                      {/* Inset and tinted, so a journal's notes read as being
                          *inside* it rather than as more rows of the same list. */}
                      <div className="rounded-md bg-muted/40 p-4">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead>Title</TableHead>
                              <TableHead>Updated</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {row.original.notes.length === 0 ? (
                              <TableRow>
                                <TableCell
                                  colSpan={2}
                                  className="text-muted-foreground"
                                >
                                  No notes.
                                </TableCell>
                              </TableRow>
                            ) : (
                              row.original.notes.map((note) => (
                                <TableRow key={note.id}>
                                  <TableCell className="font-serif">
                                    {note.title}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs text-muted-foreground">
                                    {formatDateTimeInZone(
                                      new Date(note.updatedAt),
                                      timeZone,
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="p-0">
                <EmptyState
                  size="inline"
                  eyebrow="Empty"
                  title="Nothing in the trash"
                  description="Journals you move to trash wait here until you delete them for good."
                />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};
