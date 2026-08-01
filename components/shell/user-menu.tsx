"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth, useUser } from "@clerk/nextjs";
import { LogOutIcon, MoonIcon, SunIcon, TagsIcon, Trash2Icon } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";

/**
 * The account corner: everything that is neither content nor navigation.
 *
 * This absorbs what the sidebar's footer and its "General" group used to hold.
 * Tags and Trash live here rather than in the top bar proper because they are
 * *management* screens — visited occasionally, on purpose — while the top bar's
 * own slots are reserved for what you reach constantly: the journal you are in,
 * search, and writing something new.
 */
export function UserMenu() {
  const { user: currentUser, isLoaded } = useUser();
  const { signOut } = useAuth();
  const { setTheme } = useTheme();

  // Clerk resolves the user client-side, so there is a real gap on first paint.
  // A skeleton the size of the avatar keeps the bar from reflowing when it lands.
  if (!currentUser || !isLoaded) return <Skeleton className="size-8 rounded-full" />;

  const initials = `${currentUser.firstName?.charAt(0) ?? ""}${
    currentUser.lastName?.charAt(0) ?? ""
  }`.trim();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Account menu"
            className="shrink-0 rounded-full ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          />
        }
      >
        <Avatar className="size-8">
          <AvatarImage
            src={currentUser.imageUrl}
            alt={currentUser.fullName ?? "Account"}
          />
          <AvatarFallback>{initials || "?"}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <div className="grid gap-0.5 px-2 py-1.5">
          <span className="truncate text-sm font-medium">
            {currentUser.fullName}
          </span>
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {currentUser.primaryEmailAddress?.emailAddress}
          </span>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem nativeButton={false} render={<Link href="/tags" />}>
          <TagsIcon />
          <span>Tags</span>
        </DropdownMenuItem>
        <DropdownMenuItem nativeButton={false} render={<Link href="/trash" />}>
          <Trash2Icon />
          <span>Trash</span>
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {/* The sun/moon crossfade needs a positioned box of its own here.
                In the sidebar it borrowed the menu button's `relative`; a
                submenu trigger has no such thing, and an unanchored `absolute`
                would send the moon to the nearest ancestor — the popup. */}
            <span className="relative flex size-4 shrink-0 items-center justify-center">
              <SunIcon className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
              <MoonIcon className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
            </span>
            <span>Appearance</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => setTheme("light")}>
              Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              System
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => signOut()}>
          <LogOutIcon />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
