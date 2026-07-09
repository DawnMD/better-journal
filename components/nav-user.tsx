"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth, useUser } from "@clerk/nextjs";
import { LogOutIcon } from "lucide-react";

export function NavUser() {
  const { user: currentUser, isLoaded } = useUser();
  const { signOut } = useAuth();

  if (!currentUser || !isLoaded) return <Skeleton className="h-12" />;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          className="aria-expanded:bg-muted"
          onClick={() => signOut()}
        >
          <Avatar>
            <AvatarImage
              src={currentUser.imageUrl}
              alt={currentUser.fullName!}
            />
            <AvatarFallback>{`${currentUser.firstName?.charAt(0)} ${currentUser.lastName?.charAt(0)}`}</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{currentUser.fullName}</span>
            <span className="truncate text-xs">
              {currentUser.primaryEmailAddress?.emailAddress}
            </span>
          </div>
          <LogOutIcon className="ml-auto size-4" />
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
