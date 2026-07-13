"use client";

import { CreateNewJOurnalButton } from "@/components/create-new-journal-button";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { HomeIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";

export function NavMain() {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>General</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip={"Home"}
            render={<Link href={"/dashboard"} />}
          >
            <HomeIcon />
            <span>Home</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
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
