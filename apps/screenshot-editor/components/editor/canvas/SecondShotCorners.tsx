"use client";

import { useRef } from "react";
import type { Point } from "@/lib/render/snap";
import { selectSelectedAnnotation, useEditorStore } from "@/lib/store/editor";
import { useSelectionFrame } from "./nodes/Annotations";
import { ResizeCorners, type StageRect } from "./ResizeCorners";

const RESIZE_TIP = "Drag to resize.";

type Props = {
  /** The stage's size on screen: the tooltip stays over it. */
  width: number;
  height: number;
};

/**
 * The selected second screenshot's corner handles, like the main one's: each
 * resizes it about its centre, keeping its shape.
 */
export function SecondShotCorners({ width, height }: Props) {
  const frame = useSelectionFrame((state) => state.frame);
  const selected = useEditorStore(selectSelectedAnnotation);
  const resizeScreenshotAbout = useEditorStore(
    (state) => state.resizeScreenshotAbout,
  );
  const beginGesture = useEditorStore((state) => state.beginGesture);
  const sealHistory = useEditorStore((state) => state.sealHistory);
  // Where the resize started: the frame on screen, and the centre and width
  // in image widths.
  const start = useRef<{
    frame: StageRect;
    centre: Point;
    width: number;
  } | null>(null);
  if (!frame || selected?.kind !== "screenshot" || frame.id !== selected.id)
    return null;

  return (
    <ResizeCorners
      name="second screenshot"
      box={frame}
      width={width}
      height={height}
      shown
      tip={RESIZE_TIP}
      onStart={() => {
        start.current = {
          frame,
          centre: {
            x: selected.x + selected.width / 2,
            y: selected.y + selected.height / 2,
          },
          width: selected.width,
        };
        // The whole resize is one undo step.
        beginGesture();
      }}
      onMove={(corner, point) => {
        const from = start.current;
        if (!from) return;
        // How far along the half-diagonal from the centre the corner is now.
        const centre = {
          x: from.frame.x + from.frame.width / 2,
          y: from.frame.y + from.frame.height / 2,
        };
        const diagonal = {
          x: (corner.x * from.frame.width) / 2,
          y: (corner.y * from.frame.height) / 2,
        };
        const along =
          ((point.x - centre.x) * diagonal.x +
            (point.y - centre.y) * diagonal.y) /
          (diagonal.x ** 2 + diagonal.y ** 2);
        resizeScreenshotAbout(selected.id, from.centre, from.width * along);
      }}
      onEnd={() => {
        start.current = null;
        sealHistory();
      }}
    />
  );
}
