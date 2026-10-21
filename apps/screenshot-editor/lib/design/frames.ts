import { DEVICE_KINDS, isDeviceKind, type DeviceKind } from "./devices";
import { FRAME_KINDS, type FrameKind } from "./schema";

export { FRAME_KINDS };

export const FRAME_LABELS: Record<FrameKind, string> = {
  none: "None",
  macos: "macOS",
  browser: "macOS browser",
  windows: "Windows",
  "windows-browser": "Windows browser",
  minimal: "Minimal",
  glass: "Glass",
  phone: "Phone",
  tablet: "Tablet",
  laptop: "Laptop",
  monitor: "Monitor",
};

/**
 * The window frames the Frame picker offers, None first. Glass is no longer
 * offered, but saved designs that use it still load and draw.
 */
export const FRAME_OPTIONS: readonly FrameKind[] = FRAME_KINDS.filter(
  (kind) => kind !== "glass" && !isDeviceKind(kind),
);

/** The devices the Frame picker offers after the window frames. */
export const DEVICE_OPTIONS: readonly DeviceKind[] = DEVICE_KINDS;

/** Frames with a title bar that shows `frame.title`. */
export const FRAMES_WITH_TITLE: readonly FrameKind[] = ["macos", "windows"];
/** Frames with an address bar that shows `frame.url`. */
export const FRAMES_WITH_URL: readonly FrameKind[] = [
  "browser",
  "windows-browser",
];

// Sizes at unit 1, in design px: a 1000 px wide screenshot.
const BASE: Record<FrameKind, { chromeTop: number; ring: number }> = {
  none: { chromeTop: 0, ring: 0 },
  macos: { chromeTop: 34, ring: 0 },
  browser: { chromeTop: 48, ring: 0 },
  windows: { chromeTop: 34, ring: 0 },
  "windows-browser": { chromeTop: 48, ring: 0 },
  minimal: { chromeTop: 22, ring: 0 },
  glass: { chromeTop: 0, ring: 10 },
  // Devices are laid out from their own geometry (devices.ts).
  phone: { chromeTop: 0, ring: 0 },
  tablet: { chromeTop: 0, ring: 0 },
  laptop: { chromeTop: 0, ring: 0 },
  monitor: { chromeTop: 0, ring: 0 },
};

export type FrameMetrics = {
  /** Height of the title or address bar above the content. */
  chromeTop: number;
  /** Frame material around the content on every side. */
  ring: number;
  /**
   * Multiplier for every chrome detail (buttons, text, gaps), so a frame looks
   * the same whatever the screenshot's size.
   */
  unit: number;
};

export function frameUnit(imageWidth: number): number {
  return Math.min(1.6, Math.max(0.6, imageWidth / 1000));
}

/** Natural chrome sizes for a screenshot `imageWidth` design px wide (before the shot is scaled). */
export function frameMetrics(
  kind: FrameKind,
  imageWidth: number,
): FrameMetrics {
  const unit = frameUnit(imageWidth);
  const base = BASE[kind];
  return {
    chromeTop: Math.round(base.chromeTop * unit),
    ring: Math.round(base.ring * unit),
    unit,
  };
}

export function isFrameKind(value: string): value is FrameKind {
  return (FRAME_KINDS as readonly string[]).includes(value);
}
