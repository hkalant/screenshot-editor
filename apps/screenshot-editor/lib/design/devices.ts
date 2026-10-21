import type { CornerRadii, Rect, Size } from "./layout";
import type { FrameKind } from "./schema";

// Simple device outlines drawn around the screenshot, so a learner can tell a
// phone from a laptop at a glance. They are generic on purpose: no notches,
// no brands. The screen takes the screenshot's shape, so a landscape
// screenshot gets a landscape device.

export const DEVICE_KINDS = ["phone", "tablet", "laptop"] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

export function isDeviceKind(kind: FrameKind): kind is DeviceKind {
  return (DEVICE_KINDS as readonly string[]).includes(kind);
}

/** Device colours. Devices are always dark, whatever the frame theme. */
export const DEVICE_COLORS = {
  body: "#1f2125",
  /** A lighter edge, so the outline shows on dark backgrounds too. */
  rim: "rgba(255, 255, 255, 0.16)",
  /** The laptop base. */
  stand: "#2e3136",
  /** Behind transparent pixels of the screenshot. */
  screen: "#000000",
  /** Camera dots and the speaker slot. */
  detail: "#3e4147",
  /** The laptop's finger groove. */
  groove: "#1a1b1e",
} as const;

export type DevicePart = Rect & { radii: CornerRadii };

/** A device's parts in design px, relative to the device's top-left. */
export type DeviceGeometry = Size & {
  /** The screen's surround, under the screenshot. */
  body: DevicePart;
  /** The screenshot's place. */
  screen: DevicePart;
  /** The laptop base. */
  stand: DevicePart[];
  /** Camera dots, the speaker slot and the laptop groove, drawn on top. */
  details: (DevicePart & { fill: string })[];
  /** Width of the edge highlight around the body. */
  rim: number;
};

const all = (radius: number): CornerRadii => [radius, radius, radius, radius];

/** A pill or dot of `width` by `height` centred on (cx, cy). */
function pill(cx: number, cy: number, width: number, height: number) {
  return {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
    radii: all(Math.min(width, height) / 2),
    fill: DEVICE_COLORS.detail,
  };
}

/** A body of `bezel` (top, right, bottom, left) around the screen, at (x, 0). */
function framed(
  screen: Size,
  bezel: [number, number, number, number],
  x: number,
  bodyRadii: CornerRadii,
  screenRadius: number,
) {
  const [top, right, bottom, left] = bezel;
  const body: DevicePart = {
    x,
    y: 0,
    width: screen.width + left + right,
    height: screen.height + top + bottom,
    radii: bodyRadii,
  };
  return {
    body,
    screen: {
      x: x + left,
      y: top,
      width: screen.width,
      height: screen.height,
      radii: all(screenRadius),
    },
  };
}

/**
 * The device around a `screen`-sized screenshot. Sizes follow the screen's
 * shorter side, so the device looks the same at any resolution.
 */
export function deviceGeometry(kind: DeviceKind, screen: Size): DeviceGeometry {
  const s = Math.min(screen.width, screen.height);
  const portrait = screen.height >= screen.width;
  const rim = Math.max(1, s * 0.003);
  const px = (fraction: number) => Math.max(1, Math.round(s * fraction));

  switch (kind) {
    case "phone":
    case "tablet": {
      const phone = kind === "phone";
      const bezel = px(phone ? 0.036 : 0.05);
      const outer = px(phone ? 0.145 : 0.065);
      const { body, screen: place } = framed(
        screen,
        [bezel, bezel, bezel, bezel],
        0,
        all(outer),
        phone ? outer - bezel : px(0.015),
      );
      // A speaker slot (phone) or camera (tablet) in the middle of the top
      // edge, or of the left edge on its side.
      const long = phone ? s * 0.14 : s * 0.012;
      const thick = phone ? Math.max(1, s * 0.011) : long;
      const detail = portrait
        ? pill(body.width / 2, bezel / 2, long, thick)
        : pill(bezel / 2, body.height / 2, thick, long);
      return {
        width: body.width,
        height: body.height,
        body,
        screen: place,
        stand: [],
        details: [detail],
        rim,
      };
    }
    case "laptop": {
      const side = px(0.028);
      const top = px(0.034);
      const overhang = px(0.1);
      const { body, screen: place } = framed(
        screen,
        [top, side, side, side],
        overhang,
        [px(0.03), px(0.03), px(0.006), px(0.006)],
        px(0.004),
      );
      const baseHeight = px(0.046);
      const base: DevicePart = {
        x: 0,
        y: body.height,
        width: body.width + 2 * overhang,
        height: baseHeight,
        radii: [px(0.004), px(0.004), baseHeight / 2, baseHeight / 2],
      };
      const grooveWidth = body.width * 0.16;
      const grooveHeight = Math.max(1, baseHeight * 0.32);
      return {
        width: base.width,
        height: body.height + baseHeight,
        body,
        screen: place,
        stand: [base],
        details: [
          pill(base.width / 2, top / 2, s * 0.009, s * 0.009),
          {
            x: (base.width - grooveWidth) / 2,
            y: base.y,
            width: grooveWidth,
            height: grooveHeight,
            radii: [0, 0, grooveHeight, grooveHeight],
            fill: DEVICE_COLORS.groove,
          },
        ],
        rim,
      };
    }
  }
}

/**
 * The device a screenshot of this shape could have come from, if any (as a
 * list, so a shape could suit more than one). Any other device would squash
 * a phone into a laptop's screen, so the picker greys them out; a shape that
 * is no screen's, such as an ultrawide one, fits none.
 */
export function fittingDevices(size: Size): DeviceKind[] {
  const long = Math.max(size.width, size.height);
  const short = Math.min(size.width, size.height);
  if (!(short > 0)) return [];
  const ratio = long / short;
  if (size.height > size.width) {
    if (ratio >= 1.6) return ["phone"];
    return ratio >= 1.2 ? ["tablet"] : [];
  }
  if (ratio > 2.3) return [];
  if (ratio >= 2) return ["phone"];
  if (ratio >= 1.55) return ["laptop"];
  return ratio >= 1.2 ? ["tablet"] : [];
}

/**
 * Whether `kind` suits a screenshot of `size`. No frame suits any. Window
 * frames suit all but phone screenshots: no window is that shape, while
 * window screenshots come in a tablet's or a computer's shapes.
 */
export function frameFits(kind: FrameKind, size: Size): boolean {
  if (kind === "none") return true;
  const fitting = fittingDevices(size);
  if (isDeviceKind(kind)) return fitting.includes(kind);
  return fitting[0] !== "phone";
}

/**
 * The frame to keep when the screenshot changes to one of `size`: the same
 * one if it still fits, else the best fitting device, else none.
 */
export function frameForScreenshot(kind: FrameKind, size: Size): FrameKind {
  if (frameFits(kind, size)) return kind;
  return fittingDevices(size)[0] ?? "none";
}
