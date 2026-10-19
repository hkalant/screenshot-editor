"use client";

import { Trash2 } from "lucide-react";
import { isLineEnd, type ShapeKind } from "@/lib/design/schema";
import { CANVAS_FOCUS_ATTRIBUTE } from "@/lib/hooks/useShortcuts";
import { selectSelectedAnnotation, useEditorStore } from "@/lib/store/editor";
import { clamp } from "@/lib/utils";
import { useSelectionFrame } from "./nodes/Annotations";

// The button's size, and its distance from the selection (clear of the
// resize handles).
const SIZE = 32;
const GAP = 12;

const SHAPE_NAMES: Record<ShapeKind, string> = {
  rect: "rectangle",
  rounded: "rounded rectangle",
  circle: "circle",
  highlight: "highlight",
  blur: "blur",
  magnify: "magnifier",
};

type Props = {
  /** The stage's size on screen: the button stays over the canvas. */
  width: number;
  height: number;
};

/** A delete button just above the selected annotation (below it at the top edge). */
export function SelectionActions({ width, height }: Props) {
  const frame = useSelectionFrame((state) => state.frame);
  const selected = useEditorStore(selectSelectedAnnotation);
  const removeAnnotation = useEditorStore((state) => state.removeAnnotation);
  if (!frame || !selected || frame.id !== selected.id) return null;

  const above = frame.y - GAP - SIZE;
  const below = frame.y + frame.height + GAP;
  const top = above >= 0 || below + SIZE > height ? Math.max(0, above) : below;
  const left = clamp(
    frame.x + frame.width / 2 - SIZE / 2,
    0,
    Math.max(0, width - SIZE),
  );
  const label =
    selected.kind === "step"
      ? `Delete step ${selected.number}`
      : selected.kind === "arrow"
        ? isLineEnd(selected.style)
          ? "Delete line"
          : "Delete arrow"
        : `Delete ${SHAPE_NAMES[selected.shape]}`;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        // The button goes with the annotation; keep the keys on the canvas.
        event.currentTarget
          .closest<HTMLElement>(`[${CANVAS_FOCUS_ATTRIBUTE}]`)
          ?.focus({ preventScroll: true });
        removeAnnotation(selected.id);
      }}
      className="absolute flex size-8 items-center justify-center rounded-full glass text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid [&_svg]:size-4"
      style={{ left, top }}
    >
      <Trash2 aria-hidden />
    </button>
  );
}
