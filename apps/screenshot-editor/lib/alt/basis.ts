import { isDeviceKind } from "@/lib/design/devices";
import type { Design } from "@/lib/design/schema";
import { frameSubject } from "./describe";

// What the suggested alt text is written from: the annotations and the frame
// (the device, or the page or window its text names). Written alt text keeps
// the basis it was written over, so the editor can say when these have
// changed since. What people should notice isn't part of it: that only shapes
// the suggestion, and is set aside while the user writes their own.

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
  const { frame } = design.layers[0];
  const device = isDeviceKind(frame.kind) ? frame.kind : null;
  const parts: unknown[] = [design.annotations, device];
  // Only when named, so alt text written before frames counted stays current.
  const subject = device ? null : frameSubject(frame);
  if (subject) parts.push(subject);
  return fingerprint(JSON.stringify(parts));
}

/** Whether alt text written over `basis` was written for the design as it is now. */
export const isAltCurrent = (design: Design, basis: string) =>
  altBasis(design) === basis;
