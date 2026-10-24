import { frameFits, frameForScreenshot } from "./devices";
import { insetBox, type Size } from "./layout";
import type { FrameKind } from "./schema";

// A second screenshot ("screenshot" annotation) has a frame of its own: a
// window frame or a device, whichever fits it. The theme, shadow, border and
// corners are the main screenshot's.

/** A second screenshot's height over its width, frame included. */
export const insetAspect = (source: Size, kind: FrameKind): number =>
  insetBox(source, kind, 1, 0).height;

/**
 * The frame a new second screenshot of `size` gets: the main screenshot's
 * if it fits, so the two match; otherwise one that fits it (a phone
 * screenshot beside a laptop one goes in a phone).
 */
export function newInsetFrame(main: FrameKind, size: Size): FrameKind {
  if (main === "none") return "none";
  return frameFits(main, size) ? main : frameForScreenshot(main, size);
}
