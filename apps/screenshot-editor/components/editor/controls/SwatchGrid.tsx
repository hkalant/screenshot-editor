import { useId, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export type Swatch = {
  id: string;
  /** The button's accessible name and tooltip. */
  name: string;
  /** What the swatch looks like: a colour, a CSS gradient or a thumbnail. */
  style: CSSProperties;
};

const COLUMNS = {
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  8: "grid-cols-8",
  10: "grid-cols-10",
} as const;

type Props = {
  label: string;
  /** Keep the label for screen readers only. */
  hideLabel?: boolean;
  swatches: readonly Swatch[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  columns?: keyof typeof COLUMNS;
  /** Round dots (colours) or rounded tiles (presets and pictures). */
  shape?: "tile" | "dot";
  /** Tailwind aspect class for tiles. */
  aspect?: string;
};

/** A labelled group of toggle buttons drawn as swatches. */
export function SwatchGrid({
  label,
  hideLabel,
  swatches,
  selectedId,
  onSelect,
  columns = 4,
  shape = "tile",
  aspect = "aspect-square",
}: Props) {
  const labelId = useId();
  return (
    <div className="space-y-2.5">
      <div
        id={labelId}
        className={cn("text-sm font-medium", hideLabel && "sr-only")}
      >
        {label}
      </div>
      <div
        role="group"
        aria-labelledby={labelId}
        className={cn(
          "grid",
          COLUMNS[columns],
          shape === "dot" ? "gap-1.5" : "gap-3",
        )}
      >
        {swatches.map((swatch) => {
          const selected = swatch.id === selectedId;
          return (
            <button
              key={swatch.id}
              type="button"
              title={swatch.name}
              aria-label={swatch.name}
              aria-pressed={selected}
              onClick={() => onSelect(swatch.id)}
              className={cn(
                "bg-cover bg-center ring-offset-2 ring-offset-background transition-[box-shadow,transform] outline-none hover:scale-[1.04] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                shape === "dot"
                  ? "aspect-square rounded-full border border-black/10 dark:border-white/15"
                  : cn(aspect, "rounded-md"),
                // Dots keep a bold ring; tiles get a thin one set apart from
                // the swatch, so the choice reads without a heavy border.
                selected &&
                  (shape === "dot"
                    ? "ring-2 ring-foreground"
                    : "ring-[1.5px] ring-(--selection-ring) ring-offset-[3px]"),
              )}
              style={swatch.style}
            />
          );
        })}
      </div>
    </div>
  );
}
