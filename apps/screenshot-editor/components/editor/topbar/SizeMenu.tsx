"use client";

import { ChevronDown, Link2, Link2Off, Maximize2 } from "lucide-react";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { useId, useState } from "react";
import { create } from "zustand";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Size } from "@/lib/design/layout";
import type { CanvasSpec } from "@/lib/design/schema";
import {
  aspectLabel,
  CUSTOM_SIZE,
  DEFAULT_SIZE_PRESET,
  getSizePreset,
  lockedSize,
  SIZE_PRESETS,
  type SizePreset,
} from "@/lib/design/sizes";
import { useEditorStore } from "@/lib/store/editor";
import { useDesignLayout } from "@/lib/store/hooks";
import { cn } from "@/lib/utils";

/** Size used when switching to Custom before any screenshot is loaded. */
const FALLBACK_CUSTOM: Size = { width: 1600, height: 900 };

export function canvasLabel(canvas: CanvasSpec): string {
  if (canvas.preset === "auto") return "Auto size";
  if (canvas.preset === "custom") return "Custom";
  return getSizePreset(canvas.preset)?.label ?? "Custom";
}

const itemClass =
  "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring data-[state=on]:bg-accent data-[state=on]:font-medium";

const dimensions = ({ width, height }: Size) => `${width} × ${height}`;

// The aspect lock outlives the menu and the mobile panel, which unmount
// these options when they close.
const useAspectLock = create<{
  locked: boolean;
  // The ratio taken when the lock went on, and the size a locked edit last
  // produced. Recomputing the ratio from rounded sizes would let it drift.
  aspect: number;
  appliedTo: Size | null;
  setLocked: (locked: boolean, size: Size) => void;
}>()((set) => ({
  locked: false,
  aspect: 1,
  appliedTo: null,
  setLocked: (locked, size) =>
    set({ locked, aspect: size.width / size.height, appliedTo: size }),
}));

/** The size for a locked edit, keeping the ratio the lock was turned on with. */
function lockedEdit(size: Size, side: "width" | "height", value: number) {
  const { aspect, appliedTo } = useAspectLock.getState();
  // A size changed some other way (undo, a preset) brings its own ratio.
  const same =
    appliedTo?.width === size.width && appliedTo.height === size.height;
  const ratio = same ? aspect : size.width / size.height;
  const next = lockedSize(size, side, value, ratio);
  useAspectLock.setState({ aspect: ratio, appliedTo: next });
  return next;
}

function PresetItem({ preset }: { preset: SizePreset }) {
  return (
    <ToggleGroupPrimitive.Item value={preset.id} className={itemClass}>
      <span className="flex-1 truncate">{preset.label}</span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {dimensions(preset)} · {aspectLabel(preset.width, preset.height)}
      </span>
    </ToggleGroupPrimitive.Item>
  );
}

/** The canvas size choices, as a panel (the mobile Size tab shows this). */
export function SizeOptions({ onPick }: { onPick?: () => void }) {
  const canvas = useEditorStore((state) => state.design.canvas);
  const setCanvasPreset = useEditorStore((state) => state.setCanvasPreset);
  const setCustomSize = useEditorStore((state) => state.setCustomSize);
  const layout = useDesignLayout();
  const { locked, setLocked } = useAspectLock();

  const onValueChange = (value: string) => {
    // Radix reports "" when the active item is clicked again.
    if (!value) return;
    if (value === "custom") {
      const start = layout?.canvas ?? FALLBACK_CUSTOM;
      setCustomSize(start.width, start.height);
      return;
    }
    setCanvasPreset(value);
    onPick?.();
  };

  return (
    <div className="space-y-3">
      <ToggleGroupPrimitive.Root
        type="single"
        orientation="vertical"
        aria-label="Canvas size"
        value={canvas.preset}
        onValueChange={onValueChange}
        className="flex flex-col gap-0.5"
      >
        {/* The default size first, then Auto, then the rest. */}
        <PresetItem preset={DEFAULT_SIZE_PRESET} />
        <ToggleGroupPrimitive.Item value="auto" className={itemClass}>
          <span className="flex-1">
            Auto
            <span className="block text-xs font-normal text-muted-foreground">
              Fits the screenshot and padding
            </span>
          </span>
          {canvas.preset === "auto" && layout && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {dimensions(layout.canvas)}
            </span>
          )}
        </ToggleGroupPrimitive.Item>
        {SIZE_PRESETS.filter(
          (preset) => preset.id !== DEFAULT_SIZE_PRESET.id,
        ).map((preset) => (
          <PresetItem key={preset.id} preset={preset} />
        ))}
        <ToggleGroupPrimitive.Item value="custom" className={itemClass}>
          <span className="flex-1">Custom</span>
        </ToggleGroupPrimitive.Item>
      </ToggleGroupPrimitive.Root>
      {canvas.preset === "custom" && (
        <CustomSizeFields
          size={canvas}
          locked={locked}
          onLockedChange={setLocked}
          onChange={setCustomSize}
        />
      )}
    </div>
  );
}

function CustomSizeFields({
  size,
  locked,
  onLockedChange,
  onChange,
}: {
  size: Size;
  locked: boolean;
  onLockedChange: (locked: boolean, size: Size) => void;
  onChange: (width: number, height: number) => void;
}) {
  const id = useId();
  // Only what is being typed. Otherwise the fields show the current size, so
  // a change from outside (undo, a clamp) shows up without remounting them,
  // which would drop the focus.
  const [draft, setDraft] = useState<
    Partial<Record<"width" | "height", string>>
  >({});

  const commit = (changed: "width" | "height") => {
    const typed = draft[changed];
    setDraft({});
    if (typed === undefined) return;
    const value = Number.parseInt(typed, 10);
    if (!Number.isFinite(value) || value <= 0) return;
    const next = locked
      ? lockedEdit(size, changed, value)
      : { ...size, [changed]: value };
    onChange(next.width, next.height);
  };

  const field = (name: "width" | "height", label: string) => (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        id={`${id}-${name}`}
        type="number"
        inputMode="numeric"
        min={CUSTOM_SIZE.min}
        max={CUSTOM_SIZE.max}
        value={draft[name] ?? String(size[name])}
        onChange={(event) =>
          setDraft((current) => ({ ...current, [name]: event.target.value }))
        }
        onBlur={() => commit(name)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit(name);
        }}
        className="h-9 w-full min-w-0 rounded-md border border-input bg-background/70 px-2 text-sm tabular-nums outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      />
    </label>
  );

  return (
    <div className="space-y-1.5 border-t pt-3">
      <div className="flex items-end gap-2">
        {field("width", "Width")}
        <button
          type="button"
          aria-pressed={locked}
          aria-label="Lock aspect ratio"
          title="Lock aspect ratio"
          onClick={() => onLockedChange(!locked, size)}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground outline-none hover:bg-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            locked && "bg-accent text-foreground",
          )}
        >
          {locked ? (
            <Link2 className="size-4" aria-hidden />
          ) : (
            <Link2Off className="size-4" aria-hidden />
          )}
        </button>
        {field("height", "Height")}
      </div>
      <p className="text-xs text-muted-foreground">
        {CUSTOM_SIZE.min}–{CUSTOM_SIZE.max} px per side ·{" "}
        {aspectLabel(size.width, size.height)}
      </p>
    </div>
  );
}

/** The top bar's canvas size button and menu. */
export function SizeMenu() {
  const canvas = useEditorStore((state) => state.design.canvas);
  const [open, setOpen] = useState(false);
  const label = canvasLabel(canvas);
  const size = canvas.preset === "auto" ? null : canvas;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-sm whitespace-nowrap outline-none hover:bg-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid data-[state=open]:bg-accent">
        <Maximize2 className="size-4 text-muted-foreground" aria-hidden />
        {/* The name read out starts with the visible text's purpose and
            keeps the visible text whole (WCAG 2.5.3). */}
        <span className="sr-only">Canvas size: </span>
        <span className="max-w-36 truncate @max-[37rem]/bar:sr-only">
          {label}
        </span>
        {size && (
          <span className="sr-only text-xs text-muted-foreground tabular-nums @min-[64rem]/bar:not-sr-only">
            {" "}
            {dimensions(size)}
          </span>
        )}
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 p-2.5"
        aria-label="Choose canvas size"
      >
        <SizeOptions onPick={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
