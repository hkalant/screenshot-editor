"use client";

import { ChevronDown, Link2, Link2Off } from "lucide-react";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { type ReactNode, useId, useState } from "react";
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

function PresetItem({ preset, ratio }: { preset: SizePreset; ratio: boolean }) {
  return (
    <ToggleGroupPrimitive.Item value={preset.id} className={itemClass}>
      <span className="flex-1 truncate">{preset.label}</span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {dimensions(preset)}
        {ratio && ` · ${aspectLabel(preset.width, preset.height)}`}
      </span>
    </ToggleGroupPrimitive.Item>
  );
}

/**
 * The list of canvas sizes. Choosing Custom starts from the current size.
 * `ratio` adds each size's aspect ratio, where there is room for it.
 */
function SizeList({
  onPick,
  ratio = true,
}: {
  /** Runs after any choice, Custom included. */
  onPick?: () => void;
  ratio?: boolean;
}) {
  const canvas = useEditorStore((state) => state.design.canvas);
  const setCanvasPreset = useEditorStore((state) => state.setCanvasPreset);
  const setCustomSize = useEditorStore((state) => state.setCustomSize);
  const layout = useDesignLayout();

  const onValueChange = (value: string) => {
    // Radix reports "" when the active item is clicked again.
    if (!value) return;
    if (value === "custom") {
      const start = layout?.canvas ?? FALLBACK_CUSTOM;
      setCustomSize(start.width, start.height);
    } else {
      setCanvasPreset(value);
    }
    onPick?.();
  };

  return (
    <ToggleGroupPrimitive.Root
      type="single"
      orientation="vertical"
      aria-label="Canvas size"
      value={canvas.preset}
      onValueChange={onValueChange}
      className="flex flex-col gap-0.5"
    >
      {/* The default size first, then Auto, then the rest. */}
      <PresetItem preset={DEFAULT_SIZE_PRESET} ratio={ratio} />
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
        <PresetItem key={preset.id} preset={preset} ratio={ratio} />
      ))}
      <ToggleGroupPrimitive.Item value="custom" className={itemClass}>
        <span className="flex-1">Custom</span>
      </ToggleGroupPrimitive.Item>
    </ToggleGroupPrimitive.Root>
  );
}

/** The canvas size choices, as a panel (the mobile Size tab shows this). */
export function SizeOptions() {
  const canvas = useEditorStore((state) => state.design.canvas);
  const setCustomSize = useEditorStore((state) => state.setCustomSize);
  const { locked, setLocked } = useAspectLock();

  return (
    <div className="space-y-3">
      <SizeList />
      {canvas.preset === "custom" && (
        <SizeFields
          size={canvas}
          locked={locked}
          onLockedChange={setLocked}
          onChange={setCustomSize}
          className="border-t pt-3"
        >
          {CUSTOM_SIZE.min}–{CUSTOM_SIZE.max} px per side ·{" "}
          {aspectLabel(canvas.width, canvas.height)}
        </SizeFields>
      )}
    </div>
  );
}

/** Width and height fields with the aspect lock, and a note under them. */
function SizeFields({
  size,
  locked,
  onLockedChange,
  onChange,
  className,
  children,
}: {
  size: Size;
  locked: boolean;
  onLockedChange: (locked: boolean, size: Size) => void;
  onChange: (width: number, height: number) => void;
  className?: string;
  children: ReactNode;
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
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-end gap-2">
        {field("width", "Width")}
        <button
          type="button"
          aria-pressed={locked}
          aria-label="Lock aspect ratio"
          data-tip="Lock aspect ratio"
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
      <p className="text-xs text-muted-foreground">{children}</p>
    </div>
  );
}

/**
 * The sidebar's Canvas size section: the sizes in a dropdown, and the
 * width and height, which make the size custom when changed.
 */
export function SizePanel() {
  const canvas = useEditorStore((state) => state.design.canvas);
  const setCustomSize = useEditorStore((state) => state.setCustomSize);
  const layout = useDesignLayout();
  const { locked, setLocked } = useAspectLock();
  const [open, setOpen] = useState(false);
  // Auto's size follows the screenshot, so there is none until one is added.
  const size = canvas.preset === "auto" ? layout?.canvas : canvas;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background/70 px-3 text-left text-sm outline-none hover:bg-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid data-[state=open]:bg-accent">
          {/* The name read out starts with the visible text's purpose and
              keeps the visible text whole (WCAG 2.5.3). */}
          <span className="sr-only">Canvas size: </span>
          <span className="flex-1 truncate font-medium">
            {canvasLabel(canvas)}
          </span>
          {size && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {" "}
              {aspectLabel(size.width, size.height)}
            </span>
          )}
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) min-w-64 p-2.5"
          aria-label="Choose canvas size"
        >
          {/* No room for the ratios; the chosen one shows on the button. */}
          <SizeList ratio={false} onPick={() => setOpen(false)} />
        </PopoverContent>
      </Popover>
      {size && (
        <SizeFields
          size={size}
          locked={locked}
          onLockedChange={setLocked}
          onChange={setCustomSize}
        >
          {canvas.preset === "custom"
            ? `${CUSTOM_SIZE.min}–${CUSTOM_SIZE.max} px per side`
            : "Type a size to make it custom."}
        </SizeFields>
      )}
    </>
  );
}
