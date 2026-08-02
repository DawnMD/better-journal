"use client";

import { tagDotClasses } from "@/lib/tag-color";
import { cn } from "@/lib/utils";

/**
 * A tag reduced to a coloured dot, for note chips that have no room to name one.
 *
 * A week column shared by two overlapping entries is half of a seventh of the
 * page wide, so a named chip would leave nothing for the title — the same
 * constraint that made those lanes drop the clock (`showTime={false}`).
 *
 * The dot is the one place colour carries the identity on its own, so the name
 * has to remain reachable: `title` for a pointer, `aria-label` plus `role="img"`
 * for a screen reader. Neither is a substitute for the week and day views, where
 * the chip shows the name outright.
 */
export const TagDot = ({
  name,
  className,
}: {
  name: string;
  className?: string;
}) => {
  return (
    <span
      role="img"
      title={name}
      aria-label={name}
      className={cn("size-1.5 shrink-0 rounded-full", tagDotClasses(name), className)}
    />
  );
};
