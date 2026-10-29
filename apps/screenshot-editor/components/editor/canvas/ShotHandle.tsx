"use client";

import { Move } from "lucide-react";
import { type RefObject, useEffect, useId, useRef, useState } from "react";
import type { DesignLayout, Rect } from "@/lib/design/layout";
import { SHOT_SCALE } from "@/lib/design/limits";
import { CORNERS, resizeFromCorner, type Corner } from "@/lib/render/resize";
import { NO_GUIDES, snapDrag, type Point } from "@/lib/render/snap";
import { useEditorStore } from "@/lib/store/editor";
import { clamp, cn } from "@/lib/utils";
import { useGuides } from "./nodes/Guides";

// The handle's size, and its distance from the screenshot.
const SIZE = 32;
const GAP = 8;
// The corner handles' size: inside the gap, so reaching one keeps them up.
const CORNER = 12;
// The corner tooltip: how long the pointer rests before it shows, and half
// its width, to keep it inside the stage.
const TIP_DELAY = 300;
const TIP_HALF = 112;
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

type Box = { left: number; top: number; right: number; bottom: number };

const inside = (box: Box, x: number, y: number) =>
  x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

/**
 * Whether a mouse is over `zones` of the element's parent. Always true where
 * nothing can hover (touchscreens), so the handle stays there to be found.
 * A mouse moving anywhere counts as hovering too, as some browsers (headless
 * Firefox among them) say they can't hover.
 */
function useHovered(
  element: RefObject<HTMLElement | null>,
  zones: Box[],
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
 * the way of annotating near the screenshot's edge.
 */
export function ShotHandle({ layout, scale, width, height }: Props) {
  const setPosition = useEditorStore((state) => state.setPosition);
  const resizeShot = useEditorStore((state) => state.resizeShot);
  const shotScale = useEditorStore((state) => state.design.layers[0].scale);
  const beginGesture = useEditorStore((state) => state.beginGesture);
  const sealHistory = useEditorStore((state) => state.sealHistory);
  const drag = useRef<{ pointer: Point; centre: Point } | null>(null);
  const resize = useRef<{ corner: Corner; box: Rect; scale: number } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  // The corner whose tooltip shows, if any.
  const [tip, setTip] = useState<Corner | null>(null);
  const tipTimer = useRef<number | undefined>(undefined);
  const tipId = useId();
  useEffect(() => () => window.clearTimeout(tipTimer.current), []);
  const showTip = (corner: Corner | null, delay = 0) => {
    window.clearTimeout(tipTimer.current);
    if (!corner || !delay) setTip(corner);
    else tipTimer.current = window.setTimeout(() => setTip(corner), delay);
  };

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
  // The screenshot (unrotated) and the handle, with the gap between them, so
  // moving from one to the other keeps the handle up.
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
    useGuides.setState(NO_GUIDES);
    sealHistory();
  };

  // Outside the screenshot, beyond the corner: above the top corners, below
  // the bottom ones, unless the stage's edge is in the way.
  const tipPlace = (corner: Corner) => {
    const x = (corner.x > 0 ? shot.x + shot.width : shot.x) * scale;
    const y = (corner.y > 0 ? shot.y + shot.height : shot.y) * scale;
    const above = corner.y < 0 ? y > 56 : y > height - 56;
    return {
      left: clamp(x, TIP_HALF, Math.max(TIP_HALF, width - TIP_HALF)),
      top: above ? y - CORNER : y + CORNER,
      transform: `translate(-50%, ${above ? "-100%" : "0"})`,
    };
  };

  const corners = shot.rotation === 0 && (
    <>
      {CORNERS.map((corner) => {
        const x = (corner.x > 0 ? shot.x + shot.width : shot.x) * scale;
        const y = (corner.y > 0 ? shot.y + shot.height : shot.y) * scale;
        return (
          <button
            key={corner.name}
            type="button"
            aria-label={`Resize screenshot from the ${corner.name.replace("-", " ")} corner`}
            aria-describedby={tipId}
            onPointerEnter={(event) => {
              if (event.pointerType !== "touch") showTip(corner, TIP_DELAY);
            }}
            onPointerLeave={() => showTip(null)}
            onFocus={() => showTip(corner)}
            onBlur={() => showTip(null)}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              showTip(null);
              event.currentTarget.setPointerCapture(event.pointerId);
              resize.current = {
                corner,
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
            onPointerMove={(event) => {
              const start = resize.current;
              const parent = event.currentTarget.parentElement;
              if (!start || !parent) return;
              const rect = parent.getBoundingClientRect();
              const next = resizeFromCorner(
                start.box,
                start.scale,
                start.corner,
                {
                  x: (event.clientX - rect.left) / scale,
                  y: (event.clientY - rect.top) / scale,
                },
                layout.canvas,
              );
              resizeShot(next.scale, next.position.x, next.position.y);
            }}
            onPointerUp={end}
            onPointerCancel={end}
            onLostPointerCapture={end}
            // Back to the size and place it started at.
            onDoubleClick={() => resizeShot(SHOT_SCALE.default, 0.5, 0.5)}
            className={cn(
              "absolute touch-none rounded-full border-[1.5px] border-[#0a84ff] bg-white shadow-sm transition-[opacity,visibility] duration-150 outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid motion-reduce:transition-none",
              corner.x === corner.y
                ? "cursor-nwse-resize"
                : "cursor-nesw-resize",
              !shown && "invisible opacity-0",
            )}
            style={{
              left: x - CORNER / 2,
              top: y - CORNER / 2,
              width: CORNER,
              height: CORNER,
            }}
          />
        );
      })}
      <span id={tipId} className="sr-only">
        {RESIZE_TIP}
      </span>
      {tip && shown && !dragging && (
        <span
          aria-hidden
          data-testid="resize-tooltip"
          className="pointer-events-none absolute z-50 w-max max-w-56 rounded-md bg-foreground px-2.5 py-1.5 text-center text-xs font-medium text-background shadow-md"
          style={tipPlace(tip)}
        >
          {RESIZE_TIP}
        </span>
      )}
    </>
  );

  return (
    <>
      {corners}
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
