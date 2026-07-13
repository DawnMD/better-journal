"use client";

import { CreateNewJOurnalButton } from "@/components/create-new-journal-button";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { HomeIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";

export function NavMain() {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>General</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => setOpenMobile(false)}
            tooltip={"Home"}
            render={<Link href={"/dashboard"} />}
          >
            <HomeIcon />
            <span>Home</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => setOpenMobile(false)}
            tooltip={"Trash"}
            render={<Link href={"/trash"} />}
          >
            <Trash2Icon />
            <span>Trash</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {/* <SidebarMenuItem>
          <SidebarMenuButton tooltip={"Search"}>
            <SearchIcon />
            <span>Search</span>
          </SidebarMenuButton>
        </SidebarMenuItem> */}
        <CreateNewJOurnalButton />
      </SidebarMenu>
    </SidebarGroup>
  );
}
