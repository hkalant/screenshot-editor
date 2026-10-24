import type { Rect, Size } from "@/lib/design/layout";
import { clamp } from "@/lib/utils";

/** How close (in screen px) the shot's centre must come to a centre line to snap to it. */
export const SNAP_DISTANCE = 6;

export type Point = { x: number; y: number };

/** The canvas centre lines the shot is snapped to. */
export type CentreGuides = { vertical: boolean; horizontal: boolean };

export const NO_GUIDES: CentreGuides = { vertical: false, horizontal: false };

export type DragSnap = {
  /** Where the shot's centre goes, in canvas px. */
  centre: Point;
  /** The same point as a fraction of the canvas, as the design stores it. */
  position: Point;
  guides: CentreGuides;
};

/**
 * Where a dragged shot goes: its centre stays on the canvas, and within
 * `distance` screen px of a centre line it snaps onto it. `zoom` is the
 * on-screen scale, so the snap feels the same at any zoom. With a second
 * screenshot, `offset` is from the shot's centre to the centre of both
 * (see `groupOffset`), and that is what snaps.
 */
export function snapDrag(
  centre: Point,
  canvas: Size,
  zoom: number,
  distance = SNAP_DISTANCE,
  offset: Point = { x: 0, y: 0 },
): DragSnap {
  const threshold = distance / (zoom > 0 ? zoom : 1);
  const along = (value: number, size: number, shift: number) => {
    const inside = clamp(value, 0, size);
    // Where the shot's centre is when the group's is on the line.
    const middle = size / 2 - shift;
    return middle >= 0 &&
      middle <= size &&
      Math.abs(inside - middle) <= threshold
      ? { value: middle, snapped: true }
      : { value: inside, snapped: false };
  };
  const x = along(centre.x, canvas.width, offset.x);
  const y = along(centre.y, canvas.height, offset.y);
  return {
    centre: { x: x.value, y: y.value },
    position: { x: x.value / canvas.width, y: y.value / canvas.height },
    // A vertical line marks the horizontal centre, and the other way round.
    guides: { vertical: x.snapped, horizontal: y.snapped },
  };
}

/**
 * From the centre of a shot `width` x `height` px, rotated `rotation` degrees
 * about it, to the centre of the box round it and `others` (rects from the
 * shot's unrotated top-left, rotated with it), as seen on the canvas.
 */
export function groupOffset(
  width: number,
  height: number,
  rotation: number,
  others: readonly Rect[],
): Point {
  if (others.length === 0) return { x: 0, y: 0 };
  const angle = (rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const rect of [{ x: 0, y: 0, width, height }, ...others]) {
    for (const [cx, cy] of [
      [rect.x, rect.y],
      [rect.x + rect.width, rect.y],
      [rect.x, rect.y + rect.height],
      [rect.x + rect.width, rect.y + rect.height],
    ]) {
      const dx = cx - width / 2;
      const dy = cy - height / 2;
      const x = dx * cos - dy * sin;
      const y = dx * sin + dy * cos;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}
