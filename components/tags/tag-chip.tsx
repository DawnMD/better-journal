"use client";

import { tagColorClasses } from "@/lib/tag-color";
import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";

/**
 * A tag, rendered as a coloured chip.
 *
 * Hand-rolled rather than built on the shadcn Badge, the same way
 * components/calendar/note-event.tsx builds its own chip: this needs a colour
 * class string chosen at runtime, an optional remove button, and a smaller size
 * than Badge's cva offers. Bending those three out of Badge's variants is more
 * code than the component itself.
 *
 * The name is always rendered. Colour is a recognition aid, never the only way
 * to tell two tags apart — that would fail for the ~8% of readers with a colour
 * vision deficiency, and for anyone reading a greyscale screenshot.
 */
export const TagChip = ({
  name,
  onRemove,
  size = "default",
  disabled = false,
  className,
}: {
  name: string;
  /** Omit for a read-only chip. Never passed inside a link — see NoteEvent. */
  onRemove?: () => void;
  size?: "default" | "sm";
  disabled?: boolean;
  className?: string;
}) => {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md border font-medium",
        size === "sm" ? "px-1 py-0 text-[10px]" : "px-1.5 py-0.5 text-xs",
        tagColorClasses(name),
        className,
      )}
    >
      <span className="truncate">{name}</span>

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${name}`}
          className={cn(
            "-mr-0.5 shrink-0 rounded-sm opacity-60 transition-opacity",
            "hover:opacity-100 focus-visible:opacity-100",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            "disabled:pointer-events-none disabled:opacity-40",
          )}
        >
          <XIcon className={size === "sm" ? "size-2.5" : "size-3"} />
        </button>
      )}
    </span>
  );
};
