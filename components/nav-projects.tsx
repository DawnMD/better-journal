"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { orpc } from "@/lib/orpc.query";
import { getQueryClient } from "@/lib/query/get-query-client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MoreHorizontalIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export function NavProjects() {
  const queryClient = getQueryClient();
  const { isMobile } = useSidebar();

  const { data: journals } = useQuery(
    orpc.journalRouter.getAllJournal.queryOptions(),
  );

  const { mutate: moveJournalToTrash } = useMutation(
    orpc.journalRouter.moveToTrash.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries({
          queryKey: orpc.journalRouter.getAllJournal.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: orpc.journalRouter.getTrashedJournal.queryKey(),
        });
        toast.success(`${data.title} moved to trash`);
      },
      onError: (data) => {
        toast.error(data.message);
      },
    }),
  );

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Journals</SidebarGroupLabel>
      <SidebarMenu>
        {journals?.map((item) => (
          <SidebarMenuItem key={item.id}>
            <SidebarMenuButton render={<Link href={`/journal/${item.id}`} />}>
              <span>{item.title}</span>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuAction
                    showOnHover
                    className="aria-expanded:bg-muted"
                  />
                }
              >
                <MoreHorizontalIcon />
                <span className="sr-only">More</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-fit"
                side={isMobile ? "bottom" : "right"}
                align={isMobile ? "end" : "start"}
              >
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => moveJournalToTrash({ id: item.id })}
                >
                  <Trash2Icon />
                  <span>Move to Trash</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
