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
// The corner handles' size, and how far each reaches inside the screenshot:
// the rest is outside, where its curve is drawn.
const CORNER = 28;
const INSET = 8;
// The curve at each corner fades in as the pointer comes within FAR of the
// corner, and is fully drawn within NEAR.
const NEAR = 12;
const FAR = 72;
// A short curve clear of the top-left corner, which is INSET from the
// bottom-right of a CORNER-sized box: centred on the diagonal and bending
// around the corner.
const CURVE = "M 9.35 22.35 A 12 12 0 0 1 22.35 9.35";
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
 * How close a mouse over the element's parent is to each of `points`, from 0
 * (FAR or more away) to 1 (within NEAR). All 1 until a mouse moves there, so
 * the corners show on touchscreens.
 */
function useNearness(
  element: RefObject<HTMLElement | null>,
  points: Point[],
  enabled: boolean,
): number[] {
  const [near, setNear] = useState<number[]>(() => points.map(() => 1));
  const pointsRef = useRef(points);
  useEffect(() => {
    pointsRef.current = points;
  });

  useEffect(() => {
    const parent = element.current?.parentElement;
    if (!parent || !enabled) return;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const rect = parent.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      // Rounded, so small moves far from a corner don't re-render.
      const next = pointsRef.current.map((point) => {
        const distance = Math.hypot(point.x - x, point.y - y);
        const amount = clamp((FAR - distance) / (FAR - NEAR), 0, 1);
        return Math.round(amount * 20) / 20;
      });
      setNear((now) =>
        now.length === next.length && now.every((n, i) => n === next[i])
          ? now
          : next,
      );
    };
    const onLeave = () => setNear((now) => now.map(() => 0));
    parent.addEventListener("pointermove", onMove);
    parent.addEventListener("pointerleave", onLeave);
    return () => {
      parent.removeEventListener("pointermove", onMove);
      parent.removeEventListener("pointerleave", onLeave);
    };
  }, [element, enabled]);

  return near;
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
  const resize = useRef<{
    corner: Corner;
    box: Rect;
    scale: number;
    /** Where the press was from the corner, in canvas px. */
    grab: Point;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  // The corner being dragged, or focused from the keyboard: drawn in full.
  const [active, setActive] = useState<Corner | null>(null);
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
  const cornerPoints = CORNERS.map((corner) => ({
    x: (corner.x > 0 ? shot.x + shot.width : shot.x) * scale,
    y: (corner.y > 0 ? shot.y + shot.height : shot.y) * scale,
  }));
  // Each corner handle's box, mostly outside the screenshot.
  const cornerBoxes = CORNERS.map((corner, index) => {
    const { x, y } = cornerPoints[index];
    const left = corner.x > 0 ? x - INSET : x + INSET - CORNER;
    const top = corner.y > 0 ? y - INSET : y + INSET - CORNER;
    return { left, top, right: left + CORNER, bottom: top + CORNER };
  });
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
      ...(shot.rotation === 0 ? cornerBoxes : []),
    ],
    layout.draggable,
  );
  const nearness = useNearness(
    button,
    cornerPoints,
    layout.draggable && shot.rotation === 0,
  );
  if (!layout.draggable) return null;
  const shown = hovered || dragging;

  const end = () => {
    if (!drag.current && !resize.current) return;
    drag.current = null;
    resize.current = null;
    setDragging(false);
    setActive(null);
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
      {CORNERS.map((corner, index) => {
        const { x, y } = cornerPoints[index];
        const place = cornerBoxes[index];
        const isActive = active?.x === corner.x && active?.y === corner.y;
        const opacity = isActive ? 1 : dragging ? 0 : nearness[index];
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
            onFocus={(event) => {
              showTip(corner);
              if (event.currentTarget.matches(":focus-visible"))
                setActive(corner);
            }}
            onBlur={() => {
              showTip(null);
              if (!resize.current) setActive(null);
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              showTip(null);
              event.currentTarget.setPointerCapture(event.pointerId);
              const rect =
                event.currentTarget.parentElement?.getBoundingClientRect();
              resize.current = {
                corner,
                box: {
                  x: shot.x,
                  y: shot.y,
                  width: shot.width,
                  height: shot.height,
                },
                scale: shotScale,
                // So the corner doesn't jump to the pointer.
                grab: {
                  x: (event.clientX - (rect?.left ?? 0) - x) / scale,
                  y: (event.clientY - (rect?.top ?? 0) - y) / scale,
                },
              };
              setDragging(true);
              setActive(corner);
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
                  x: (event.clientX - rect.left) / scale - start.grab.x,
                  y: (event.clientY - rect.top) / scale - start.grab.y,
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
              "absolute touch-none rounded-md transition-[opacity,visibility] duration-150 outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid motion-reduce:transition-none",
              corner.x === corner.y
                ? "cursor-nwse-resize"
                : "cursor-nesw-resize",
              !shown && "invisible opacity-0",
            )}
            style={{
              left: place.left,
              top: place.top,
              width: CORNER,
              height: CORNER,
            }}
          >
            <svg
              aria-hidden
              data-testid="resize-curve"
              viewBox={`0 0 ${CORNER} ${CORNER}`}
              className="pointer-events-none absolute inset-0 size-full overflow-visible drop-shadow-[0_1px_2px_rgb(0_0_0/0.4)] transition-opacity duration-100 motion-reduce:transition-none"
              style={{
                opacity,
                // Drawn for the top-left corner, and mirrored for the others.
                transform: `scale(${-corner.x}, ${-corner.y})`,
              }}
            >
              <path
                d={CURVE}
                fill="none"
                stroke="white"
                strokeWidth={5}
                strokeLinecap="round"
              />
            </svg>
          </button>
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
