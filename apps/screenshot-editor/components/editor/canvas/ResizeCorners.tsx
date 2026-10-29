"use client";

import { type RefObject, useEffect, useId, useRef, useState } from "react";
import { CORNERS, type Corner } from "@/lib/render/resize";
import type { Point } from "@/lib/render/snap";
import { clamp, cn } from "@/lib/utils";

// The corner handles' size, and how far each reaches inside the box: the
// rest is outside, where its curve is drawn.
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

/** A box on the stage, in stage (screen) px. */
export type StageRect = { x: number; y: number; width: number; height: number };

export type Zone = { left: number; top: number; right: number; bottom: number };

/** Where `corner` of `box` is, in stage px. */
export const cornerPoint = (box: StageRect, corner: Corner): Point => ({
  x: corner.x > 0 ? box.x + box.width : box.x,
  y: corner.y > 0 ? box.y + box.height : box.y,
});

/** Each corner handle's box around `box`, mostly outside it. */
export function cornerZones(box: StageRect): Zone[] {
  return CORNERS.map((corner) => {
    const { x, y } = cornerPoint(box, corner);
    const left = corner.x > 0 ? x - INSET : x + INSET - CORNER;
    const top = corner.y > 0 ? y - INSET : y + INSET - CORNER;
    return { left, top, right: left + CORNER, bottom: top + CORNER };
  });
}

/**
 * How close a mouse over the element's parent is to each of `points`, from 0
 * (FAR or more away) to 1 (within NEAR). All 1 until a mouse moves there, so
 * the corners show on touchscreens.
 */
function useNearness(
  element: RefObject<HTMLElement | null>,
  points: Point[],
): number[] {
  const [near, setNear] = useState<number[]>(() => points.map(() => 1));
  const pointsRef = useRef(points);
  useEffect(() => {
    pointsRef.current = points;
  });

  useEffect(() => {
    const parent = element.current?.parentElement;
    if (!parent) return;
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
  }, [element]);

  return near;
}

type Props = {
  /** What is resized, in the handles' names: "screenshot". */
  name: string;
  /** The box resized, in stage px. */
  box: StageRect;
  /** The stage's size on screen: the tooltip stays over it. */
  width: number;
  height: number;
  /** Whether the handles are up. Hidden, they take no clicks and no focus. */
  shown: boolean;
  /** Something else is being dragged: no curves, no tooltip. */
  busy?: boolean;
  /** What the tooltip says. */
  tip: string;
  onStart: (corner: Corner) => void;
  /**
   * The pointer moved while resizing from `corner`, to where that corner
   * should now be, in stage px.
   */
  onMove: (corner: Corner, point: Point) => void;
  onEnd: () => void;
  onDoubleClick?: () => void;
};

/**
 * A handle at each corner of `box` that resizes it. Each is drawn as a short
 * curve clear of its corner, which fades in only as the pointer comes close,
 * and says what it does when the pointer rests on it.
 */
export function ResizeCorners({
  name,
  box,
  width,
  height,
  shown,
  busy = false,
  tip: tipText,
  onStart,
  onMove,
  onEnd,
  onDoubleClick,
}: Props) {
  const first = useRef<HTMLButtonElement>(null);
  // Where the press was from the corner, so the corner doesn't jump to the
  // pointer.
  const grab = useRef<Point | null>(null);
  // The corner being dragged, or focused from the keyboard: drawn in full.
  const [active, setActive] = useState<Corner | null>(null);
  const [resizing, setResizing] = useState(false);
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

  const points = CORNERS.map((corner) => cornerPoint(box, corner));
  const zones = cornerZones(box);
  const nearness = useNearness(first, points);

  const end = () => {
    if (!grab.current) return;
    grab.current = null;
    setResizing(false);
    setActive(null);
    onEnd();
  };

  // Outside the box, beyond the corner: above the top corners, below the
  // bottom ones, unless the stage's edge is in the way.
  const tipPlace = (corner: Corner) => {
    const { x, y } = cornerPoint(box, corner);
    const above = corner.y < 0 ? y > 56 : y > height - 56;
    return {
      left: clamp(x, TIP_HALF, Math.max(TIP_HALF, width - TIP_HALF)),
      top: above ? y - CORNER : y + CORNER,
      transform: `translate(-50%, ${above ? "-100%" : "0"})`,
    };
  };

  return (
    <>
      {CORNERS.map((corner, index) => {
        const { x, y } = points[index];
        const zone = zones[index];
        const isActive = active?.x === corner.x && active?.y === corner.y;
        const opacity = isActive ? 1 : resizing || busy ? 0 : nearness[index];
        return (
          <button
            key={corner.name}
            ref={index === 0 ? first : undefined}
            type="button"
            aria-label={`Resize ${name} from the ${corner.name.replace("-", " ")} corner`}
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
              if (!grab.current) setActive(null);
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              showTip(null);
              event.currentTarget.setPointerCapture(event.pointerId);
              const rect =
                event.currentTarget.parentElement?.getBoundingClientRect();
              grab.current = {
                x: event.clientX - (rect?.left ?? 0) - x,
                y: event.clientY - (rect?.top ?? 0) - y,
              };
              setResizing(true);
              setActive(corner);
              onStart(corner);
            }}
            onPointerMove={(event) => {
              const parent = event.currentTarget.parentElement;
              if (!grab.current || !parent) return;
              const rect = parent.getBoundingClientRect();
              onMove(corner, {
                x: event.clientX - rect.left - grab.current.x,
                y: event.clientY - rect.top - grab.current.y,
              });
            }}
            onPointerUp={end}
            onPointerCancel={end}
            onLostPointerCapture={end}
            onDoubleClick={onDoubleClick}
            className={cn(
              "absolute touch-none rounded-md transition-[opacity,visibility] duration-150 outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid motion-reduce:transition-none",
              corner.x === corner.y
                ? "cursor-nwse-resize"
                : "cursor-nesw-resize",
              !shown && "invisible opacity-0",
            )}
            style={{
              left: zone.left,
              top: zone.top,
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
        {tipText}
      </span>
      {tip && shown && !resizing && !busy && (
        <span
          aria-hidden
          data-testid="resize-tooltip"
          className="pointer-events-none absolute z-50 w-max max-w-56 rounded-md bg-foreground px-2.5 py-1.5 text-center text-xs font-medium text-background shadow-md"
          style={tipPlace(tip)}
        >
          {tipText}
        </span>
      )}
    </>
  );
}
