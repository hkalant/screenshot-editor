import type { Box, Point } from "./annotations";
import { arrowCurve } from "./arrowShape";
import type { Annotation } from "./schema";

// Snapping: an annotation dragged (or a step placed) near a key point of
// another lands exactly on it, so a step sits centred on the end of a line
// or a box's centre lines up with an arrow's tip. Points are in image widths.

/** How close, in screen pixels, a point must come to snap. */
export const SNAP_DISTANCE = 8;

/** The points of an annotation others snap to. */
export function snapTargets(annotation: Annotation): Point[] {
  if (annotation.kind === "step") return [{ x: annotation.x, y: annotation.y }];
  if (annotation.kind === "arrow") {
    const tail = { x: annotation.x, y: annotation.y };
    const tip = {
      x: annotation.x + annotation.dx,
      y: annotation.y + annotation.dy,
    };
    // Tail, tip, then the curve's middle, which a bend moves.
    return [tail, tip, arrowCurve(tail, tip, annotation.bend).handle];
  }
  const { x, y, width, height } = annotation;
  const middle = { x: x + width / 2, y: y + height / 2 };
  return [
    middle,
    { x, y },
    { x: x + width, y },
    { x, y: y + height },
    { x: x + width, y: y + height },
    { x: middle.x, y },
    { x: middle.x, y: y + height },
    { x, y: middle.y },
    { x: x + width, y: middle.y },
  ];
}

/** The points of an annotation that snap, from its own x and y. */
function anchors(annotation: Annotation): Point[] {
  if (annotation.kind === "step") return [{ x: 0, y: 0 }];
  if (annotation.kind === "arrow")
    return [
      { x: 0, y: 0 },
      { x: annotation.dx, y: annotation.dy },
    ];
  const { width, height } = annotation;
  return [
    { x: width / 2, y: height / 2 },
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: 0, y: height },
    { x: width, y: height },
  ];
}

/** The nearest of `targets` to `point`, if within `distance`. */
export function snapPoint(
  point: Point,
  targets: readonly Point[],
  distance: number,
): Point | null {
  let best: Point | null = null;
  let bestDistance = distance;
  for (const target of targets) {
    const d = Math.hypot(target.x - point.x, target.y - point.y);
    if (d <= bestDistance) {
      best = target;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Where `annotation` goes when dragged to `position` (its x and y): moved so
 * that its nearest snapping point lands on a target, if one is within
 * `distance`. `target` is that point, for a guide, or null.
 */
export function snapMove(
  annotation: Annotation,
  position: Point,
  targets: readonly Point[],
  distance: number,
): { position: Point; target: Point | null } {
  let best: { position: Point; target: Point } | null = null;
  let bestDistance = distance;
  for (const anchor of anchors(annotation)) {
    const at = { x: position.x + anchor.x, y: position.y + anchor.y };
    const target = snapPoint(at, targets, bestDistance);
    if (!target) continue;
    bestDistance = Math.hypot(target.x - at.x, target.y - at.y);
    best = {
      position: {
        x: position.x + target.x - at.x,
        y: position.y + target.y - at.y,
      },
      target,
    };
  }
  return best ?? { position, target: null };
}

/** The end (tail or tip) of an arrow or line within `distance` of `point`. */
export function arrowEndNear(
  point: Point,
  annotations: readonly Annotation[],
  distance: number,
): Point | null {
  return snapPoint(
    point,
    annotations.flatMap((annotation) =>
      annotation.kind === "arrow" ? snapTargets(annotation).slice(0, 2) : [],
    ),
    distance,
  );
}

/** The lines a dragged second screenshot lined up on, in image widths. */
export type AlignGuides = {
  /** The ys horizontal lines mark: tops, middles or bottoms level. */
  y: number[];
  /** The xs vertical lines mark: centred across. */
  x: number[];
};

// Lines this close (in image widths) count as level: rounding, not a gap.
const LEVEL = 1e-6;

/**
 * Where a box `size` in size (a second screenshot) goes when dragged to
 * `position` (its top-left): within `distance` of being level with `target`
 * (tops, middles or bottoms), or of being centred on it across, it moves
 * there. Each direction snaps on its own, to the nearest line (middles win a
 * tie). The guides are every line it is then level on: a box as tall as the
 * target is level at the top, middle and bottom at once.
 */
export function alignBox(
  size: { width: number; height: number },
  position: Point,
  target: Box,
  distance: number,
): { position: Point; guides: AlignGuides } {
  // `pairs` are an offset into the box and the line on the target it meets.
  const along = (start: number, pairs: [number, number][]) => {
    let snapped = start;
    let best = distance;
    let found = false;
    for (const [offset, line] of pairs) {
      const d = Math.abs(start + offset - line);
      // Later pairs must be clearly closer: equal ones differ by rounding.
      if (found ? d < best - LEVEL : d <= distance) {
        snapped = line - offset;
        best = d;
        found = true;
      }
    }
    const lines = found
      ? pairs
          .filter(([offset, line]) => Math.abs(snapped + offset - line) < LEVEL)
          .map(([, line]) => line)
      : [];
    return { start: snapped, lines };
  };
  const y = along(position.y, [
    [size.height / 2, target.y + target.height / 2],
    [0, target.y],
    [size.height, target.y + target.height],
  ]);
  const x = along(position.x, [[size.width / 2, target.x + target.width / 2]]);
  return {
    position: { x: x.start, y: y.start },
    guides: { x: x.lines, y: y.lines },
  };
}
