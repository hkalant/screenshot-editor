"use client";

import { Move } from "lucide-react";
import { useRef } from "react";
import type { DesignLayout } from "@/lib/design/layout";
import { NO_GUIDES, snapDrag, type Point } from "@/lib/render/snap";
import { useEditorStore } from "@/lib/store/editor";
import { clamp } from "@/lib/utils";
import { useGuides } from "./nodes/Guides";

// The handle's size, and its distance from the screenshot.
const SIZE = 32;
const GAP = 8;

type Props = {
  layout: DesignLayout;
  /** On-screen zoom of the stage. */
  scale: number;
  /** The stage's size on screen: the handle stays over the canvas. */
  width: number;
  height: number;
};

/**
 * A handle just below the screenshot that moves it whatever annotation tool
 * is on (drawing tools take presses on the screenshot itself).
 */
export function ShotHandle({ layout, scale, width, height }: Props) {
  const setPosition = useEditorStore((state) => state.setPosition);
  const beginGesture = useEditorStore((state) => state.beginGesture);
  const sealHistory = useEditorStore((state) => state.sealHistory);
  const drag = useRef<{ pointer: Point; centre: Point } | null>(null);
  if (!layout.draggable) return null;

  const shot = layout.shot;
  const centre = { x: shot.x + shot.width / 2, y: shot.y + shot.height / 2 };
  // Below the screenshot; above it, or inside its bottom edge, when there's
  // no room.
  const below = (shot.y + shot.height) * scale + GAP;
  const above = shot.y * scale - GAP - SIZE;
  const top =
    below + SIZE <= height
      ? below
      : above >= 0
        ? above
        : clamp(below - 2 * GAP - SIZE, 0, Math.max(0, height - SIZE));
  const left = clamp(centre.x * scale - SIZE / 2, 0, Math.max(0, width - SIZE));

  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    useGuides.setState(NO_GUIDES);
    sealHistory();
  };

  return (
    <button
      type="button"
      aria-label="Move screenshot"
      title="Drag to move the screenshot"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          pointer: { x: event.clientX, y: event.clientY },
          centre,
        };
        // The whole drag is one undo step.
        beginGesture();
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start) return;
        const snap = snapDrag(
          {
            x: start.centre.x + (event.clientX - start.pointer.x) / scale,
            y: start.centre.y + (event.clientY - start.pointer.y) / scale,
          },
          layout.canvas,
          scale,
        );
        useGuides.setState(snap.guides);
        setPosition(snap.position.x, snap.position.y);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      className="absolute flex size-8 cursor-grab touch-none items-center justify-center rounded-full glass text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid active:cursor-grabbing [&_svg]:size-4"
      style={{ left, top }}
    >
      <Move aria-hidden />
    </button>
  );
}
