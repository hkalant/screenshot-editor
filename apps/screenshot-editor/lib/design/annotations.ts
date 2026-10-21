import { clamp } from "@/lib/utils";
import {
  ANNOTATION_COLORS,
  MAX_STEP_NUMBER,
  MAX_STEP_SIZE,
  MIN_STEP_SIZE,
  type Annotation,
  type AnnotationColor,
  type ShapeAnnotation,
  type ShapeKind,
} from "./schema";

// Sizes and rules for the annotations drawn on the screenshot. Every length
// is in image widths (1 = the screenshot's width), like the positions.

export { ANNOTATION_COLORS, MAX_STEP_NUMBER, MAX_STEP_SIZE, MIN_STEP_SIZE };

export const ANNOTATION_COLOR_NAMES: Record<AnnotationColor, string> = {
  "#424a52": "Charcoal",
  "#d10373": "Pink",
  "#f9c909": "Yellow",
};

/** Steps and shapes start in this colour. */
export const DEFAULT_ANNOTATION_COLOR: AnnotationColor = "#d10373";

export function isAnnotationColor(value: string): value is AnnotationColor {
  return (ANNOTATION_COLORS as readonly string[]).includes(value);
}

/** Radius of a step circle at its standard size (1). */
export const STEP_RADIUS = 0.019;
/** Border of an outline shape. */
export const SHAPE_STROKE = 0.004;
/** How opaque a highlight's fill is. It has no border. */
export const HIGHLIGHT_FILL_OPACITY = 0.2;
/** Corner radius of a rounded rectangle. */
export const SHAPE_CORNER = 0.012;
/** A click without a drag makes an arrow this long, pointing at the click. */
export const DEFAULT_ARROW = { x: 0.1, y: 0.07 };
/** A click without a drag makes a shape this size, centred on the click. */
export const DEFAULT_SHAPE_SIZE = { width: 0.16, height: 0.1 };
/** Drags shorter than this are clicks. */
export const MIN_DRAG = 0.01;
/** The smallest side a shape can be resized to. */
export const MIN_SHAPE_SIDE = 0.01;

/** The number shown in a step: dark on yellow, white on the darker colours. */
export function stepTextColor(color: AnnotationColor): string {
  return color === "#f9c909" ? "#424a52" : "#ffffff";
}

/** The step number from typed text: digits only, 1 to MAX_STEP_NUMBER, or null. */
export function parseStepNumber(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const value = Number.parseInt(text.trim(), 10);
  return value >= 1 && value <= MAX_STEP_NUMBER ? value : null;
}

/** Screenshots taller than this many widths don't get heavier annotations. */
export const MAX_WEIGHT_ASPECT = 2.5;

/**
 * What annotation sizes (lines, steps, corners) are measured in, in image
 * widths: the longer side, so a portrait phone screenshot's lines are as
 * heavy as a landscape one's of the same height. Very tall captures are
 * capped, or their steps would fill the width.
 */
export const annotationWeight = (aspect: number) =>
  Number.isFinite(aspect) ? clamp(aspect, 1, MAX_WEIGHT_ASPECT) : 1;

/** Image height in image widths. */
export const imageAspect = (size: { width: number; height: number }) =>
  size.height / size.width;

export type Point = { x: number; y: number };
export type Box = Point & { width: number; height: number };

/** The screenshot itself, as an area: 1 wide and `aspect` tall. */
export const imageArea = (aspect: number): Box => ({
  x: 0,
  y: 0,
  width: 1,
  height: aspect,
});

/**
 * The whole canvas in image widths, measured from the screenshot's top-left
 * corner: annotations can go anywhere on it, on the background too.
 */
export function canvasArea(
  canvas: { width: number; height: number },
  image: Box,
): Box {
  return {
    x: -image.x / image.width,
    y: -image.y / image.width,
    width: canvas.width / image.width,
    height: canvas.height / image.width,
  };
}

/** A point kept inside an area. */
export function clampToArea(point: Point, area: Box): Point {
  return {
    x: clamp(point.x, area.x, area.x + area.width),
    y: clamp(point.y, area.y, area.y + area.height),
  };
}

/**
 * Where a line from `start` toward `end` ends when it is kept to a multiple
 * of 45 degrees (Shift held): as far along that direction as `end` reaches,
 * and stopping at the edge of the area. `start` is in the area.
 */
export function snapEnd(start: Point, end: Point, area: Box): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  const ux = Math.round(Math.cos(angle) * 1e9) / 1e9;
  const uy = Math.round(Math.sin(angle) * 1e9) / 1e9;
  let length = Math.max(0, dx * ux + dy * uy);
  // Stop at the area's edges.
  if (ux > 0) length = Math.min(length, (area.x + area.width - start.x) / ux);
  if (ux < 0) length = Math.min(length, (area.x - start.x) / ux);
  if (uy > 0) length = Math.min(length, (area.y + area.height - start.y) / uy);
  if (uy < 0) length = Math.min(length, (area.y - start.y) / uy);
  length = Math.max(0, length);
  return { x: start.x + ux * length, y: start.y + uy * length };
}

/** Whether a point is inside an area. */
export function inArea(point: Point, area: Box): boolean {
  return (
    point.x >= area.x &&
    point.x <= area.x + area.width &&
    point.y >= area.y &&
    point.y <= area.y + area.height
  );
}

/**
 * The box dragged out from `start` to `end`, kept in the area. A circle's
 * box is square: its side is the longer of the two drags.
 */
export function dragBox(
  start: Point,
  end: Point,
  shape: ShapeKind,
  area: Box,
): Box {
  const to = clampToArea(end, area);
  let dx = to.x - start.x;
  let dy = to.y - start.y;
  if (shape === "circle") {
    // Square, but no bigger than the room in the drag's direction.
    const room = Math.min(
      dx < 0 ? start.x - area.x : area.x + area.width - start.x,
      dy < 0 ? start.y - area.y : area.y + area.height - start.y,
    );
    const side = Math.min(Math.max(Math.abs(dx), Math.abs(dy)), room);
    dx = Math.sign(dx || 1) * side;
    dy = Math.sign(dy || 1) * side;
  }
  return {
    x: Math.min(start.x, start.x + dx),
    y: Math.min(start.y, start.y + dy),
    width: Math.abs(dx),
    height: Math.abs(dy),
  };
}

/** The default-size shape for a click at `point`, kept in the area. */
export function clickBox(point: Point, shape: ShapeKind, area: Box): Box {
  let { width, height } = DEFAULT_SHAPE_SIZE;
  if (shape === "circle") width = height;
  width = Math.min(width, area.width);
  height = Math.min(height, area.height);
  if (shape === "circle") width = height = Math.min(width, height);
  return {
    x: clamp(point.x - width / 2, area.x, area.x + area.width - width),
    y: clamp(point.y - height / 2, area.y, area.y + area.height - height),
    width,
    height,
  };
}

/** Whether a drag from `start` to `end` is long enough to be one. */
export function isDrag(start: Point, end: Point): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) >= MIN_DRAG;
}

const round4 = (value: number) => Math.round(value * 10000) / 10000;

/** Rounds positions and sizes so saved designs stay small. */
export function roundBox(box: Box): Box {
  return {
    x: round4(box.x),
    y: round4(box.y),
    width: Math.max(0.0001, round4(box.width)),
    height: Math.max(0.0001, round4(box.height)),
  };
}

export const roundPoint = (point: Point): Point => ({
  x: round4(point.x),
  y: round4(point.y),
});

/**
 * A box moved or resized, kept in the area (as far as its size allows).
 * A `square` box (a circle's) stays square.
 */
export function fitBox(box: Box, area: Box, square = false): Box {
  let width = Math.min(Math.max(box.width, MIN_SHAPE_SIDE), area.width);
  let height = Math.min(Math.max(box.height, MIN_SHAPE_SIDE), area.height);
  if (square) width = height = Math.min(width, height);
  return {
    x: clamp(box.x, area.x, area.x + area.width - width),
    y: clamp(box.y, area.y, area.y + area.height - height),
    width,
    height,
  };
}

/**
 * The arrow for a click at `point`: it points at the click from above left,
 * or from wherever there is room.
 */
export function clickArrow(
  point: Point,
  area: Box,
): { start: Point; end: Point } {
  const end = clampToArea(point, area);
  const candidates = [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: 1, y: 1 },
  ].map((sign) =>
    clampToArea(
      {
        x: end.x + sign.x * DEFAULT_ARROW.x,
        y: end.y + sign.y * DEFAULT_ARROW.y,
      },
      area,
    ),
  );
  // The longest of the four, preferring the first.
  const length = (start: Point) => Math.hypot(end.x - start.x, end.y - start.y);
  const start = candidates.reduce((best, next) =>
    length(next) > length(best) + 1e-9 ? next : best,
  );
  return { start, end };
}

/**
 * Where an arrow's tail can go so the whole arrow stays in the area (as far
 * as its size allows).
 */
export function fitArrow(start: Point, delta: Point, area: Box): Point {
  return {
    x: clamp(
      start.x,
      area.x + Math.max(0, -delta.x),
      Math.max(area.x, area.x + area.width - Math.max(0, delta.x)),
    ),
    y: clamp(
      start.y,
      area.y + Math.max(0, -delta.y),
      Math.max(area.y, area.y + area.height - Math.max(0, delta.y)),
    ),
  };
}

/** A step size kept within the limits, rounded to keep saved designs small. */
export function clampStepSize(size: number): number {
  return Math.round(clamp(size, MIN_STEP_SIZE, MAX_STEP_SIZE) * 1000) / 1000;
}

let counter = 0;

export function newAnnotationId(): string {
  counter += 1;
  return `a${Date.now().toString(36)}${counter.toString(36)}`;
}

export function isShape(annotation: Annotation): annotation is ShapeAnnotation {
  return annotation.kind === "shape";
}

/** Whether a shape's box stays square: circles, and round magnifiers. */
export function isSquareShape(
  shape: Pick<ShapeAnnotation, "shape" | "lens">,
): boolean {
  return (
    shape.shape === "circle" ||
    (shape.shape === "magnify" && shape.lens === "circle")
  );
}
