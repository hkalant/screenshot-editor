"use client";

import { CopyPlus, Trash2 } from "lucide-react";
import { pasteAnnotation } from "@/lib/annotationClipboard";
import { isLineEnd, type ShapeKind } from "@/lib/design/schema";
import { CANVAS_FOCUS_ATTRIBUTE } from "@/lib/hooks/useShortcuts";
import { selectSelectedAnnotation, useEditorStore } from "@/lib/store/editor";
import { clamp } from "@/lib/utils";
import { useSelectionFrame } from "./nodes/Annotations";

// The button's size, and its distance from the selection (clear of the
// resize handles).
const SIZE = 32;
const GAP = 12;
/** Between the two buttons. */
const SPACING = 4;

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

/** Duplicate and delete buttons just above the selected annotation (below it at the top edge). */
export function SelectionActions({ width, height }: Props) {
  const frame = useSelectionFrame((state) => state.frame);
  const selected = useEditorStore(selectSelectedAnnotation);
  const removeAnnotation = useEditorStore((state) => state.removeAnnotation);
  if (!frame || !selected || frame.id !== selected.id) return null;

  const above = frame.y - GAP - SIZE;
  const below = frame.y + frame.height + GAP;
  const top = above >= 0 || below + SIZE > height ? Math.max(0, above) : below;
  // Two buttons side by side, centred over the selection.
  const left = clamp(
    frame.x + frame.width / 2 - (SIZE * 2 + SPACING) / 2,
    0,
    Math.max(0, width - SIZE * 2 - SPACING),
  );
  const name =
    selected.kind === "step"
      ? `step ${selected.number}`
      : selected.kind === "arrow"
        ? isLineEnd(selected.style)
          ? "line"
          : "arrow"
        : SHAPE_NAMES[selected.shape];
  // The buttons go with the annotation; keep the keys on the canvas.
  const keepFocus = (button: HTMLElement) =>
    button
      .closest<HTMLElement>(`[${CANVAS_FOCUS_ATTRIBUTE}]`)
      ?.focus({ preventScroll: true });
  const buttonClass =
    "flex size-8 items-center justify-center rounded-md pane-float text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid [&_svg]:size-4";

  return (
    <div className="absolute flex gap-1" style={{ left, top }}>
      <button
        type="button"
        aria-label={`Duplicate ${name}`}
        title={`Duplicate ${name}`}
        onClick={(event) => {
          keepFocus(event.currentTarget);
          pasteAnnotation(selected);
        }}
        className={buttonClass}
      >
        <CopyPlus aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`Delete ${name}`}
        title={`Delete ${name}`}
        onClick={(event) => {
          keepFocus(event.currentTarget);
          removeAnnotation(selected.id);
        }}
        className={buttonClass}
      >
        <Trash2 aria-hidden />
      </button>
    </div>
  );
}
