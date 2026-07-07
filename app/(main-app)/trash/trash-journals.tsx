"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { orpc } from "@/lib/orpc.query";
import { getQueryClient } from "@/lib/query/get-query-client";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";

export const TrashedJournals = () => {
  const queryClient = getQueryClient();
  const { data, isError } = useSuspenseQuery(
    orpc.journalRouter.getTrashedJournal.queryOptions(),
  );

  const { mutate: deletePermanently } = useMutation(
    orpc.journalRouter.deletePermanently.mutationOptions({
      onSuccess: () => {
        toast.success("Deleted");
        queryClient.invalidateQueries({
          queryKey: orpc.journalRouter.getTrashedJournal.queryKey(),
        });
      },
    }),
  );

  const { mutate: restoreJournal } = useMutation(
    orpc.journalRouter.removeFromTrash.mutationOptions({
      onSuccess: () => {
        toast.success("Restored");
        queryClient.invalidateQueries({
          queryKey: orpc.journalRouter.getTrashedJournal.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: orpc.journalRouter.getAllJournal.queryKey(),
        });
      },
    }),
  );

  if (isError || !data) {
    return <p>Something went wrong</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Journal Name</TableHead>
          <TableHead>Notes Count</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">{item.title}</TableCell>
            <TableCell>{item._count.notes}</TableCell>
            <TableCell className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon" className="size-8">
                      <MoreHorizontalIcon />
                      <span className="sr-only">Open menu</span>
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => restoreJournal({ id: item.id })}
                  >
                    Restore
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => deletePermanently({ id: item.id })}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
