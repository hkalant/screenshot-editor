import { isDeviceKind } from "@/lib/design/devices";
import type { Design } from "@/lib/design/schema";

// What the suggested alt text is written from: the annotations and the device
// the screenshot is shown on. Written alt text keeps the basis it was written
// over, so the editor can say when the annotations have changed since.

/** A short fingerprint (FNV-1a, 32 bits) of `text`. Not for security. */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** The basis of the design's suggested alt text. */
export function altBasis(design: Design): string {
  const { kind } = design.layers[0].frame;
  return fingerprint(
    JSON.stringify([design.annotations, isDeviceKind(kind) ? kind : null]),
  );
}

/** Whether alt text written over `basis` was written for the design as it is now. */
export const isAltCurrent = (design: Design, basis: string) =>
  altBasis(design) === basis;
