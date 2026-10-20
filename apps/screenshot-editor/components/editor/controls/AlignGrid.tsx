import { useId } from "react";
import type { Alignment } from "@/lib/design/layout";
import { cn } from "@/lib/utils";

const ROWS: readonly { v: Alignment; name: string }[] = [
  { v: "start", name: "top" },
  { v: "center", name: "" },
  { v: "end", name: "bottom" },
];
const COLUMNS: readonly { h: Alignment; name: string }[] = [
  { h: "start", name: "left" },
  { h: "center", name: "" },
  { h: "end", name: "right" },
];

/** "Align top left", "Align top", … "Align centre" in the middle. */
function cellName(row: string, column: string): string {
  const where = [row, column].filter(Boolean).join(" ");
  return `Align ${where || "centre"}`;
}

type Props = {
  label: string;
  onAlign: (horizontal: Alignment, vertical: Alignment) => void;
  /** Whether the shot already sits at this point (shown, not announced). */
  isActive?: (horizontal: Alignment, vertical: Alignment) => boolean;
};

/** Nine buttons that line the shot up with an edge, a corner or the centre. */
export function AlignGrid({ label, onAlign, isActive }: Props) {
  const labelId = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <span id={labelId} className="text-sm font-medium">
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        className="grid grid-cols-3 gap-0.5 rounded-md bg-muted p-0.5"
      >
        {ROWS.map((row) =>
          COLUMNS.map((column) => {
            const name = cellName(row.name, column.name);
            const active = isActive?.(column.h, row.v) ?? false;
            return (
              <button
                key={name}
                type="button"
                aria-label={name}
                title={name}
                onClick={() => onAlign(column.h, row.v)}
                className="group flex size-7 items-center justify-center rounded-sm transition-colors outline-none hover:bg-background focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                <span
                  aria-hidden
                  className={cn(
                    "rounded-full transition-all",
                    active
                      ? "size-2 bg-primary"
                      : "size-1.5 bg-muted-foreground/40 group-hover:bg-foreground/70",
                  )}
                />
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
