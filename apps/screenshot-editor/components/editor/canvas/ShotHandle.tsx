"use client";

import { Move } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import type { DesignLayout, Rect } from "@/lib/design/layout";
import { SHOT_SCALE } from "@/lib/design/limits";
import { resizeFromCorner } from "@/lib/render/resize";
import { NO_GUIDES, snapDrag, type Point } from "@/lib/render/snap";
import { useEditorStore } from "@/lib/store/editor";
import { clamp, cn } from "@/lib/utils";
import { useGuides } from "./nodes/Guides";
import { cornerZones, ResizeCorners, type Zone } from "./ResizeCorners";

// The handle's size, and its distance from the screenshot.
const SIZE = 32;
const GAP = 8;
const RESIZE_TIP =
  "Drag to resize. Double-click to return to the original size.";

type Props = {
  layout: DesignLayout;
  /** On-screen zoom of the stage. */
  scale: number;
  /** The stage's size on screen: the handle stays over the canvas. */
  width: number;
  height: number;
};

const inside = (box: Zone, x: number, y: number) =>
  x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

/**
 * Whether a mouse is over `zones` of the element's parent. Always true where
 * nothing can hover (touchscreens), so the handle stays there to be found.
 * A mouse moving anywhere counts as hovering too, as some browsers (headless
 * Firefox among them) say they can't hover.
 */
function useHovered(
  element: RefObject<HTMLElement | null>,
  zones: Zone[],
  /** Whether the element is rendered, so there is a parent to watch. */
  enabled: boolean,
): boolean {
  const [canHover, setCanHover] = useState(false);
  const [over, setOver] = useState(false);
  const zonesRef = useRef(zones);
  useEffect(() => {
    zonesRef.current = zones;
  });

  useEffect(() => {
    const query = window.matchMedia("(hover: hover)");
    const update = () => setCanHover((can) => can || query.matches);
    const onMouse = (event: PointerEvent) => {
      if (event.pointerType === "mouse") setCanHover(true);
    };
    update();
    query.addEventListener("change", update);
    window.addEventListener("pointermove", onMouse);
    return () => {
      query.removeEventListener("change", update);
      window.removeEventListener("pointermove", onMouse);
    };
  }, []);

  useEffect(() => {
    const parent = element.current?.parentElement;
    if (!parent || !canHover || !enabled) return;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const rect = parent.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      setOver(zonesRef.current.some((zone) => inside(zone, x, y)));
    };
    const onLeave = () => setOver(false);
    parent.addEventListener("pointermove", onMove);
    parent.addEventListener("pointerleave", onLeave);
    return () => {
      parent.removeEventListener("pointermove", onMove);
      parent.removeEventListener("pointerleave", onLeave);
    };
  }, [element, canHover, enabled]);

  return !canHover || over;
}

/**
 * A handle just below the screenshot that moves it whatever annotation tool
 * is on (drawing tools take presses on the screenshot itself), and one at
 * each corner that resizes it. With a mouse they show only while the
 * pointer is over the screenshot or the move handle, so they don't get in
 * the way of annotating near the screenshot's edge, and each corner's curve
 * fades in only as the pointer comes close to it.
 */
export function ShotHandle({ layout, scale, width, height }: Props) {
  const setPosition = useEditorStore((state) => state.setPosition);
  const resizeShot = useEditorStore((state) => state.resizeShot);
  const shotScale = useEditorStore((state) => state.design.layers[0].scale);
  const beginGesture = useEditorStore((state) => state.beginGesture);
  const sealHistory = useEditorStore((state) => state.sealHistory);
  const drag = useRef<{ pointer: Point; centre: Point } | null>(null);
  const resize = useRef<{ box: Rect; scale: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  // Moving by the handle below, rather than resizing from a corner.
  const [moving, setMoving] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

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
  // The screenshot on screen, which the corner handles go round.
  const onScreen = {
    x: shot.x * scale,
    y: shot.y * scale,
    width: shot.width * scale,
    height: shot.height * scale,
  };
  // The screenshot (unrotated), its corner handles and the move handle, with
  // the gap between them, so moving from one to another keeps them up.
  const hovered = useHovered(
    button,
    [
      {
        left: shot.x * scale - GAP,
        top: shot.y * scale - GAP,
        right: (shot.x + shot.width) * scale + GAP,
        bottom: (shot.y + shot.height) * scale + GAP,
      },
      {
        left: left - GAP,
        top: top - GAP,
        right: left + SIZE + GAP,
        bottom: top + SIZE + GAP,
      },
      ...(shot.rotation === 0 ? cornerZones(onScreen) : []),
    ],
    layout.draggable,
  );
  if (!layout.draggable) return null;
  const shown = hovered || dragging;

  const end = () => {
    if (!drag.current && !resize.current) return;
    drag.current = null;
    resize.current = null;
    setDragging(false);
    setMoving(false);
    useGuides.setState(NO_GUIDES);
    sealHistory();
  };

  return (
    <>
      {shot.rotation === 0 && (
        <ResizeCorners
          name="screenshot"
          box={onScreen}
          width={width}
          height={height}
          shown={shown}
          busy={moving}
          tip={RESIZE_TIP}
          onStart={() => {
            resize.current = {
              box: {
                x: shot.x,
                y: shot.y,
                width: shot.width,
                height: shot.height,
              },
              scale: shotScale,
            };
            setDragging(true);
            // The whole resize is one undo step.
            beginGesture();
          }}
          onMove={(corner, point) => {
            const start = resize.current;
            if (!start) return;
            const next = resizeFromCorner(
              start.box,
              start.scale,
              corner,
              { x: point.x / scale, y: point.y / scale },
              layout.canvas,
            );
            resizeShot(next.scale, next.position.x, next.position.y);
          }}
          onEnd={end}
          // Back to the size and place it started at.
          onDoubleClick={() => resizeShot(SHOT_SCALE.default, 0.5, 0.5)}
        />
      )}
      <button
        ref={button}
        type="button"
        aria-label="Move screenshot"
        data-tip="Drag to move the screenshot"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            pointer: { x: event.clientX, y: event.clientY },
            centre,
          };
          setDragging(true);
          setMoving(true);
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
        // Hidden, it takes no clicks and no focus: it only works by dragging.
        className={cn(
          "absolute flex size-8 cursor-grab touch-none items-center justify-center rounded-md pane-float text-foreground transition-[background-color,opacity,visibility] duration-150 outline-none hover:bg-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid active:cursor-grabbing motion-reduce:transition-none [&_svg]:size-4",
          !shown && "invisible opacity-0",
        )}
        style={{ left, top }}
      >
        <Move aria-hidden />
      </button>
    </>
  );
}
