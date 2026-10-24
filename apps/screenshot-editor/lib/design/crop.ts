import { clamp } from "@/lib/utils";
import type { Size } from "./layout";
import type { Annotation, Crop } from "./schema";

// Cropping the main screenshot. A crop is the part of the original image
// that's shown, as fractions of it across and down; the original is kept.

/** The whole image. */
export const FULL_CROP: Crop = { x: 0, y: 0, width: 1, height: 1 };

/** The smallest crop, in pixels of the original, across and down. */
export const MIN_CROP_PIXELS = 16;

const round = (value: number) => Math.round(value * 10000) / 10000;

/**
 * A crop kept inside `image` and at least the smallest size, rounded as the
 * design stores it, or null for the whole image.
 */
export function normalizeCrop(crop: Crop, image: Size): Crop | null {
  const minWidth = Math.min(1, MIN_CROP_PIXELS / image.width);
  const minHeight = Math.min(1, MIN_CROP_PIXELS / image.height);
  const width = clamp(crop.width, minWidth, 1);
  const height = clamp(crop.height, minHeight, 1);
  const next = {
    x: round(clamp(crop.x, 0, 1 - width)),
    y: round(clamp(crop.y, 0, 1 - height)),
    width: round(width),
    height: round(height),
  };
  // Within half a pixel of the whole image is the whole image.
  const whole =
    next.x * image.width < 0.5 &&
    next.y * image.height < 0.5 &&
    (1 - next.width) * image.width < 0.5 &&
    (1 - next.height) * image.height < 0.5;
  return whole ? null : next;
}

/** The size of the cropped image, in pixels of the original. */
export function croppedSize(image: Size, crop: Crop | null): Size {
  if (!crop) return { width: image.width, height: image.height };
  return {
    width: Math.max(1, Math.round(crop.width * image.width)),
    height: Math.max(1, Math.round(crop.height * image.height)),
  };
}

type Box = { x: number; y: number; width: number; height: number };

/** The box round an annotation, in image widths. */
function boundsOf(annotation: Annotation): Box {
  switch (annotation.kind) {
    case "step":
      // Just its centre: a step belongs where it points.
      return { x: annotation.x, y: annotation.y, width: 0, height: 0 };
    case "arrow":
      return {
        x: Math.min(annotation.x, annotation.x + annotation.dx),
        y: Math.min(annotation.y, annotation.y + annotation.dy),
        width: Math.abs(annotation.dx),
        height: Math.abs(annotation.dy),
      };
    default:
      return annotation;
  }
}

/** Whether two boxes touch (a box with no size is a point). */
const touches = (a: Box, b: Box) =>
  a.x <= b.x + b.width &&
  b.x <= a.x + a.width &&
  a.y <= b.y + b.height &&
  b.y <= a.y + a.height;

function intersection(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > x && bottom > y
    ? { x, y, width: right - x, height: bottom - y }
    : null;
}

/**
 * Moves annotations from the screenshot cropped to `from` onto it cropped
 * to `to`, so each stays over the same part of the original. `image` is
 * the original's size. Those that were on the screenshot and are now
 * wholly cut off are removed; blur and highlight boxes are trimmed to its
 * new edge, and a magnifier enlarges the nearest spot still there.
 * Annotations on the background move with the screenshot's content.
 */
export function recropAnnotations(
  annotations: readonly Annotation[],
  from: Crop | null,
  to: Crop | null,
  image: Size,
): { annotations: Annotation[]; removed: number } {
  const before = from ?? FULL_CROP;
  const after = to ?? FULL_CROP;
  // Image heights per image width of the original.
  const aspect = image.height / image.width;
  const scale = before.width / after.width;
  const shiftX = (before.x - after.x) / after.width;
  const shiftY = ((before.y - after.y) * aspect) / after.width;
  // Within what the design allows (see schema.ts).
  const mapX = (x: number) => round(clamp(x * scale + shiftX, -100, 100));
  const mapY = (y: number) => round(clamp(y * scale + shiftY, -100, 100));
  const length = (value: number) => round(clamp(value * scale, -100, 100));
  const oldImage = {
    x: 0,
    y: 0,
    width: 1,
    height: (before.height * aspect) / before.width,
  };
  const newImage = {
    x: 0,
    y: 0,
    width: 1,
    height: (after.height * aspect) / after.width,
  };
  const mapBox = (box: Box): Box => ({
    x: mapX(box.x),
    y: mapY(box.y),
    width: length(box.width),
    height: length(box.height),
  });

  let removed = 0;
  const next: Annotation[] = [];
  for (const annotation of annotations) {
    const onImage = touches(boundsOf(annotation), oldImage);
    const moved = mapBox(boundsOf(annotation));
    if (onImage && !touches(moved, newImage)) {
      removed += 1;
      continue;
    }
    switch (annotation.kind) {
      case "step":
        next.push({ ...annotation, x: moved.x, y: moved.y });
        break;
      case "arrow":
        next.push({
          ...annotation,
          x: mapX(annotation.x),
          y: mapY(annotation.y),
          dx: length(annotation.dx),
          dy: length(annotation.dy),
        });
        break;
      case "screenshot":
        next.push({ ...annotation, ...mapBox(annotation) });
        break;
      case "shape": {
        let box = mapBox(annotation);
        // Over the screenshot, these stop at its edge.
        if (
          onImage &&
          (annotation.shape === "blur" || annotation.shape === "highlight")
        ) {
          const inside = intersection(box, newImage);
          if (!inside) {
            removed += 1;
            continue;
          }
          box = {
            x: round(inside.x),
            y: round(inside.y),
            width: round(inside.width),
            height: round(inside.height),
          };
        }
        const shape = { ...annotation, ...box };
        if (annotation.from)
          shape.from = {
            x: round(clamp(mapX(annotation.from.x), 0, 1)),
            y: round(clamp(mapY(annotation.from.y), 0, newImage.height)),
          };
        next.push(shape);
        break;
      }
    }
  }
  return { annotations: next, removed };
}

/** A crop handle: the sides it moves (north, south, east, west). */
export type CropHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const CORNER_HANDLES: readonly CropHandle[] = ["nw", "ne", "se", "sw"];
export const CROP_HANDLES: readonly CropHandle[] = [
  ...CORNER_HANDLES,
  "n",
  "e",
  "s",
  "w",
];

/** A crop moved by `dx`, `dy` (fractions of the image), kept inside it. */
export function moveCrop(crop: Crop, dx: number, dy: number): Crop {
  return {
    ...crop,
    x: clamp(crop.x + dx, 0, 1 - crop.width),
    y: clamp(crop.y + dy, 0, 1 - crop.height),
  };
}

/**
 * A crop with `handle` dragged to `point` (fractions of the image). With
 * `ratio` (width over height, in pixels) it keeps that shape, from the
 * corners only, anchored at the opposite corner.
 */
export function resizeCrop(
  crop: Crop,
  handle: CropHandle,
  point: { x: number; y: number },
  image: Size,
  ratio: number | null,
): Crop {
  const minWidth = Math.min(1, MIN_CROP_PIXELS / image.width);
  const minHeight = Math.min(1, MIN_CROP_PIXELS / image.height);
  const east = handle.includes("e");
  const west = handle.includes("w");
  const south = handle.includes("s");
  const north = handle.includes("n");

  if (ratio && (east || west) && (north || south)) {
    const anchor = {
      x: east ? crop.x : crop.x + crop.width,
      y: south ? crop.y : crop.y + crop.height,
    };
    // In pixels: as wide as the pointer asks across or down, whichever
    // moved more, within the image.
    const across = Math.abs(point.x - anchor.x) * image.width;
    const down = Math.abs(point.y - anchor.y) * image.height * ratio;
    const now = crop.width * image.width;
    const wanted =
      Math.abs(across - now) >= Math.abs(down - now) ? across : down;
    const room = Math.min(
      (east ? 1 - anchor.x : anchor.x) * image.width,
      (south ? 1 - anchor.y : anchor.y) * image.height * ratio,
    );
    const least = Math.max(MIN_CROP_PIXELS, MIN_CROP_PIXELS * ratio);
    const widthPx = clamp(wanted, Math.min(least, room), room);
    const width = widthPx / image.width;
    const height = widthPx / ratio / image.height;
    return {
      x: east ? anchor.x : anchor.x - width,
      y: south ? anchor.y : anchor.y - height,
      width,
      height,
    };
  }

  let left = crop.x;
  let right = crop.x + crop.width;
  let top = crop.y;
  let bottom = crop.y + crop.height;
  if (west) left = clamp(point.x, 0, right - minWidth);
  if (east) right = clamp(point.x, left + minWidth, 1);
  if (north) top = clamp(point.y, 0, bottom - minHeight);
  if (south) bottom = clamp(point.y, top + minHeight, 1);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The largest crop of `ratio` (width over height, in pixels), centred. */
export function largestCrop(image: Size, ratio: number | null): Crop {
  if (!ratio) return FULL_CROP;
  const imageRatio = image.width / image.height;
  if (ratio >= imageRatio) {
    const height = imageRatio / ratio;
    return { x: 0, y: (1 - height) / 2, width: 1, height };
  }
  const width = ratio / imageRatio;
  return { x: (1 - width) / 2, y: 0, width, height: 1 };
}
