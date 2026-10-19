"use client";

import { useId, useState } from "react";
import { HexColorPicker } from "react-colorful";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { normalizeHex } from "@/lib/design/colors";
import { useEditorStore } from "@/lib/store/editor";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  /** "#rrggbb" */
  value: string;
  onChange: (color: string) => void;
  /** Hide the visible label (the swatch is still named for screen readers). */
  hideLabel?: boolean;
  className?: string;
};

/** A colour swatch that opens a picker with a hex field. */
export function ColorField({
  label,
  value,
  onChange,
  hideLabel,
  className,
}: Props) {
  const hexId = useId();
  const sealHistory = useEditorStore((state) => state.sealHistory);
  // What is typed in the hex field, until it is a valid colour.
  const [draft, setDraft] = useState<string | null>(null);

  const commitDraft = () => {
    if (draft === null) return;
    const color = normalizeHex(draft);
    if (color) onChange(color);
    setDraft(null);
  };

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      {!hideLabel && <span className="text-sm font-medium">{label}</span>}
      <Popover
        onOpenChange={(open) => {
          // Escape closes without a blur, so text typed and abandoned is
          // dropped here instead of reappearing (and applying) next time.
          setDraft(null);
          if (!open) sealHistory();
        }}
      >
        <PopoverTrigger
          aria-label={`${label}: ${value}`}
          title={label}
          className="flex h-8 items-center gap-2 rounded-full border bg-background/70 px-1.5 pr-2.5 text-xs text-muted-foreground tabular-nums outline-none hover:bg-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          <span
            className="size-5 rounded-full border border-black/10 dark:border-white/15"
            style={{ backgroundColor: value }}
            aria-hidden
          />
          {value}
        </PopoverTrigger>
        <PopoverContent
          className="w-60 space-y-3 p-3"
          align="end"
          aria-label={label}
        >
          <HexColorPicker
            color={value}
            onChange={onChange}
            style={{ width: "100%" }}
          />
          <div className="flex items-center gap-2">
            <label htmlFor={hexId} className="text-xs text-muted-foreground">
              Hex
            </label>
            <input
              id={hexId}
              value={draft ?? value}
              spellCheck={false}
              autoComplete="off"
              maxLength={7}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitDraft}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitDraft();
              }}
              className="h-8 min-w-0 flex-1 rounded-full border border-input bg-background/70 px-2 font-mono text-sm outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
