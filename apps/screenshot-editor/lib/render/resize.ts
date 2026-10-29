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
 * The shot resized by dragging `corner` to `pointer` (canvas px), with the
 * opposite corner staying put and the shape kept. `box` is the shot at
 * `scale`. It grows up to half as big again as fitting inside the padding,
 * so past the canvas's edges, which crop it.
 */
export function resizeFromCorner(
  box: Rect,
  scale: number,
  corner: Corner,
  pointer: Point,
  canvas: Size,
): ShotResize {
  // The shot's size at scale 1, and the corner that stays put.
  const base = { width: box.width / scale, height: box.height / scale };
  const anchor = {
    x: corner.x > 0 ? box.x : box.x + box.width,
    y: corner.y > 0 ? box.y : box.y + box.height,
  };
  // How far along the diagonal the pointer is, so either direction counts.
  const diagonal = { x: corner.x * base.width, y: corner.y * base.height };
  const along =
    ((pointer.x - anchor.x) * diagonal.x +
      (pointer.y - anchor.y) * diagonal.y) /
    (diagonal.x ** 2 + diagonal.y ** 2);
  const next = clamp(along, SHOT_SCALE.min, SHOT_SCALE.max);
  return {
    scale: next,
    position: {
      x: (anchor.x + (corner.x * base.width * next) / 2) / canvas.width,
      y: (anchor.y + (corner.y * base.height * next) / 2) / canvas.height,
    },
  };
}
