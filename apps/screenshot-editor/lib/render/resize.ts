import type { Rect, Size } from "@/lib/design/layout";
import { SHOT_SCALE } from "@/lib/design/limits";
import { clamp } from "@/lib/utils";
import type { Point } from "./snap";

/** A corner of the shot, as which way it points from the centre. */
export type Corner = { x: -1 | 1; y: -1 | 1 };

export const CORNERS: readonly (Corner & { name: string })[] = [
  { x: -1, y: -1, name: "top-left" },
  { x: 1, y: -1, name: "top-right" },
  { x: -1, y: 1, name: "bottom-left" },
  { x: 1, y: 1, name: "bottom-right" },
];

export type ShotResize = {
  scale: number;
  /** Where the shot's centre goes, as a fraction of the canvas. */
  position: Point;
};

/**
 * The shot resized by dragging `corner` to `pointer` (canvas px), about its
 * centre, as if Shift were held: the centre stays put and the shape is kept.
 * `box` is the shot at `scale`. It grows up to half as big again as fitting
 * inside the padding, so past the canvas's edges, which crop it.
 */
export function resizeFromCorner(
  box: Rect,
  scale: number,
  corner: Corner,
  pointer: Point,
  canvas: Size,
): ShotResize {
  // The shot's size at scale 1, and the centre that stays put.
  const base = { width: box.width / scale, height: box.height / scale };
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  // How far along the half-diagonal the pointer is, so either direction
  // counts.
  const diagonal = {
    x: (corner.x * base.width) / 2,
    y: (corner.y * base.height) / 2,
  };
  const along =
    ((pointer.x - centre.x) * diagonal.x +
      (pointer.y - centre.y) * diagonal.y) /
    (diagonal.x ** 2 + diagonal.y ** 2);
  return {
    scale: clamp(along, SHOT_SCALE.min, SHOT_SCALE.max),
    position: { x: centre.x / canvas.width, y: centre.y / canvas.height },
  };
}
