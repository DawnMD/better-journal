import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { orpc } from "@/lib/orpc.query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";

export const TrashDropdownActions = ({ id }: { id: string }) => {
  const queryClient = useQueryClient();
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
  return (
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
        <DropdownMenuItem onClick={() => restoreJournal({ id })}>
          Restore
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => deletePermanently({ id })}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
