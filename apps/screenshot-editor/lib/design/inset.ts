import { frameMetrics } from "./frames";
import { fitWithin, type Size } from "./layout";
import { MAX_DESIGN_SIDE } from "./limits";
import type { FrameKind } from "./schema";

// A second screenshot ("screenshot" annotation) sits in the main screenshot's
// window or browser frame, or none: devices are drawn for the main one only.

/** The frames a second screenshot can share with the main one. */
export const INSET_FRAME_KINDS: readonly FrameKind[] = [
  "macos",
  "browser",
  "windows",
  "windows-browser",
  "minimal",
  "glass",
];

/** Whether the main screenshot's frame can go round a second screenshot too. */
export const sharesFrame = (kind: FrameKind) =>
  INSET_FRAME_KINDS.includes(kind);

/** The frame a second screenshot is drawn in, given the main screenshot's. */
export const insetFrameKind = (framed: boolean, main: FrameKind): FrameKind =>
  framed && sharesFrame(main) ? main : "none";

/** A second screenshot's height over its width, frame included. */
export function insetAspect(source: Size, kind: FrameKind): number {
  const image = fitWithin(source, MAX_DESIGN_SIDE);
  const { chromeTop, ring } = frameMetrics(kind, image.width);
  return (image.height + 2 * ring + chromeTop) / (image.width + 2 * ring);
}
