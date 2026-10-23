import type { Point } from "./annotations";
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
