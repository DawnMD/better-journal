"use client";

import { Button } from "@/components/ui/button";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

/**
 * Light and dark, for a visitor who has no account menu to keep it in.
 *
 * The same sun/moon crossfade `UserMenu` uses, but driven by the `dark` class
 * rather than by state — which is what lets this render identically on the
 * server and on the client. `resolvedTheme` is only read inside the handler, by
 * which point next-themes has resolved it; reading it during render would make
 * the markup depend on a value the server cannot know, and the first paint would
 * mismatch.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle between light and dark"
      className="text-muted-foreground hover:text-foreground"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <span className="relative flex size-4 items-center justify-center">
        <SunIcon className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
        <MoonIcon className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
      </span>
    </Button>
  );
}
