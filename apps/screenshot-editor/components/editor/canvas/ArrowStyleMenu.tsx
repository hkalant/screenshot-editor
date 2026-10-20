"use client";

import { useEffect, useRef } from "react";
import { arrowShape, paintArrow } from "@/lib/design/arrowShape";
import {
  ARROW_STYLES,
  isLineEnd,
  LINE_ENDS,
  type ArrowStyle,
  type LineEnd,
} from "@/lib/design/schema";
import { CANVAS_FOCUS_ATTRIBUTE } from "@/lib/hooks/useShortcuts";
import { useEditorStore } from "@/lib/store/editor";
import { clamp } from "@/lib/utils";
import {
  setOverArrowMenu,
  useArrowHover,
  useSelectionFrame,
} from "./nodes/Annotations";

export const ARROW_STYLE_NAMES: Record<ArrowStyle, string> = {
  solid: "Solid",
  bold: "Bold",
  halo: "Outlined",
  dotted: "Dotted",
  chevrons: "Chevron",
};

export const LINE_END_NAMES: Record<LineEnd, string> = {
  flat: "Flat",
  dot: "Dot",
  round: "Round",
  bar: "Bar",
};

/** What a style is called, as the buttons that pick it say. */
const styleLabel = (style: ArrowStyle | LineEnd) =>
  isLineEnd(style)
    ? `${LINE_END_NAMES[style]} end`
    : `${ARROW_STYLE_NAMES[style]} arrow`;

// The menu's size, and its distance below the arrow.
const BUTTON = 32;
const PADDING = 4;
const GAP = 10;
const WIDTH = ARROW_STYLES.length * BUTTON + 2 * PADDING;
const HEIGHT = BUTTON + 2 * PADDING;
const PREVIEW = 22;

/** A small picture of an arrow style or line end, in the arrow's colour. */
function StylePreview({
  style,
  color,
}: {
  style: ArrowStyle | LineEnd;
  color: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = PREVIEW * ratio;
    canvas.height = PREVIEW * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, PREVIEW, PREVIEW);
    // Sized as on a screenshot about 300 px wide, so the head shows; lines
    // as on a narrower one, so their ends tell apart, with room for a dot.
    const line = isLineEnd(style);
    const inset = line ? 6 : 3;
    const shape = arrowShape(
      style,
      { x: 3, y: PREVIEW - 4 },
      { x: PREVIEW - inset, y: inset + 1 },
      0,
      line ? 480 : 300,
    );
    if (shape) paintArrow(context, shape, color);
  }, [style, color]);
  return (
    <canvas ref={ref} aria-hidden style={{ width: PREVIEW, height: PREVIEW }} />
  );
}

// A menu removed under the mouse gets no pointerleave. Defined once, so React
// only calls it when the menu comes and goes.
const leaveOnRemove = () => () => setOverArrowMenu(false);

type Props = {
  /** The stage's size on screen: the menu stays over the canvas. */
  width: number;
  height: number;
};

/**
 * Arrow styles (or line ends), just below the arrow or line under the mouse
 * (or the selected one, for touch screens).
 */
export function ArrowStyleMenu({ width, height }: Props) {
  const hover = useArrowHover((state) => state.frame);
  const selection = useSelectionFrame((state) => state.frame);
  const annotations = useEditorStore((state) => state.design.annotations);
  const selectedId = useEditorStore((state) => state.selectedAnnotationId);
  const setArrowStyle = useEditorStore((state) => state.setArrowStyle);

  const frame =
    hover ?? (selection && selection.id === selectedId ? selection : null);
  const arrow = frame
    ? annotations.find((item) => item.id === frame.id)
    : undefined;
  if (!frame || arrow?.kind !== "arrow") return null;
  const line = isLineEnd(arrow.style);
  const styles: readonly (ArrowStyle | LineEnd)[] = line
    ? LINE_ENDS
    : ARROW_STYLES;

  const below = frame.y + frame.height + GAP;
  const top =
    below + HEIGHT <= height
      ? below
      : clamp(frame.y - GAP - HEIGHT, 0, Math.max(0, height - HEIGHT));
  const left = clamp(
    frame.x + frame.width / 2 - WIDTH / 2,
    0,
    Math.max(0, width - WIDTH),
  );

  return (
    <div
      role="radiogroup"
      aria-label={line ? "Line end" : "Arrow style"}
      ref={leaveOnRemove}
      onPointerEnter={() => setOverArrowMenu(true)}
      onPointerLeave={() => setOverArrowMenu(false)}
      className="absolute flex items-center rounded-lg pane-float p-1"
      style={{ left, top }}
    >
      {styles.map((style) => (
        <button
          key={style}
          type="button"
          role="radio"
          aria-checked={arrow.style === style}
          aria-label={styleLabel(style)}
          title={styleLabel(style)}
          onClick={(event) => {
            // Keep the keys on the canvas.
            event.currentTarget
              .closest<HTMLElement>(`[${CANVAS_FOCUS_ATTRIBUTE}]`)
              ?.focus({ preventScroll: true });
            setArrowStyle(arrow.id, style);
          }}
          className="flex size-8 shrink-0 items-center justify-center rounded-sm transition-colors outline-none hover:bg-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-checked:bg-accent aria-checked:ring-2 aria-checked:ring-foreground/25 aria-checked:ring-inset"
        >
          <StylePreview style={style} color={arrow.color} />
        </button>
      ))}
    </div>
  );
}
