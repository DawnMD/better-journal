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
import { ChevronRight, HomeIcon, Moon, Sun, Trash2Icon } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function NavMain() {
  const { setOpenMobile } = useSidebar();
  const { setTheme } = useTheme();

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
        <CreateNewJOurnalButton />
        <DropdownMenu>
          <SidebarMenuItem>
            <DropdownMenuTrigger
              render={<SidebarMenuButton tooltip={"Appearance"} />}
            >
              <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
              <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
              <span>Appearance</span>
              <ChevronRight className="ml-auto size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTheme("light")}>
                Light
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark")}>
                Dark
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("system")}>
                System
              </DropdownMenuItem>
            </DropdownMenuContent>
          </SidebarMenuItem>
        </DropdownMenu>
      </SidebarMenu>
    </SidebarGroup>
  );
}
