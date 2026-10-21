import type { Size } from "@/lib/design/layout";
import type {
  FrameKind,
  FrameSpec,
  ShadowSpec,
  ShotLayer,
} from "@/lib/design/schema";

// Colours and detail geometry for the window frames. Pure, so the canvas
// nodes and the panel previews draw the same thing and it can be tested.
// Sizes are canvas px: callers pass `unit` (layout.shot.unit), which already
// includes the shot's scale.

export type FrameTheme = FrameSpec["theme"];

export const FRAME_FONT_FAMILY = '"Inter Variable", system-ui, sans-serif';
export const FRAME_FONT_WEIGHT = "500";
/** Loaded through document.fonts before frame text is drawn. */
export const FRAME_FONT_PROBE = '500 13px "Inter Variable"';

export type FramePalette = {
  /** Window background, seen behind transparent pixels of the screenshot. */
  body: string;
  bar: string;
  separator: string;
  /** macOS title. */
  title: string;
  /** Windows title and caption glyphs. */
  text: string;
  pill: string;
  pillText: string;
  /** Minimal frame dots. */
  dot: string;
  /** Glass ring. */
  ringFill: string;
  /** The ring's edge: bright at the top, fading to `ringStroke` at the bottom. */
  ringHighlight: string;
  ringStroke: string;
};

const PALETTES: Record<FrameTheme, FramePalette> = {
  light: {
    body: "#ffffff",
    bar: "#f1f1f3",
    separator: "rgba(0, 0, 0, 0.1)",
    title: "#4a4a50",
    text: "#1f1f22",
    pill: "#e2e2e6",
    pillText: "#55555c",
    dot: "#cfcfd4",
    ringFill: "rgba(255, 255, 255, 0.28)",
    ringHighlight: "rgba(255, 255, 255, 0.95)",
    ringStroke: "rgba(255, 255, 255, 0.45)",
  },
  dark: {
    body: "#1c1c1f",
    bar: "#2b2b2f",
    separator: "rgba(0, 0, 0, 0.5)",
    title: "#d4d4d8",
    text: "#ededf0",
    pill: "#3b3b40",
    pillText: "#c4c4ca",
    dot: "#55555c",
    ringFill: "rgba(0, 0, 0, 0.3)",
    ringHighlight: "rgba(255, 255, 255, 0.45)",
    ringStroke: "rgba(255, 255, 255, 0.12)",
  },
};

export function framePalette(theme: FrameTheme): FramePalette {
  return PALETTES[theme];
}

export const TRAFFIC_LIGHT_COLORS = ["#ff5f57", "#febc2e", "#28c840"] as const;

/** The shot is drawn as one image when there is nothing around it. */
export function isPlainShot(shot: Pick<ShotLayer, "frame">) {
  return shot.frame.kind === "none";
}

/** "None" or opacity 0 means no shadow. */
export function hasShadow(shadow: ShadowSpec): boolean {
  return shadow.preset !== "none" && shadow.opacity > 0;
}

export type Box = { x: number; y: number; width: number; height: number };

export type StrokeBox = Box & { cornerRadius: number; strokeWidth: number };

/**
 * A stroke of `strokeWidth` that sits just inside a rounded `size` box (Konva
 * centres strokes on the path, so the path is inset by half the width).
 */
export function insideStroke(
  size: Size,
  radius: number,
  strokeWidth: number,
): StrokeBox | null {
  if (!(strokeWidth > 0)) return null;
  const half = strokeWidth / 2;
  return {
    x: half,
    y: half,
    width: Math.max(0, size.width - strokeWidth),
    height: Math.max(0, size.height - strokeWidth),
    cornerRadius: Math.max(0, radius - half),
    strokeWidth,
  };
}

/**
 * A stroke of `strokeWidth` that sits just outside a rounded `size` box, so it
 * adds to the box instead of covering its edge.
 */
export function outsideStroke(
  size: Size,
  radius: number,
  strokeWidth: number,
): StrokeBox | null {
  if (!(strokeWidth > 0)) return null;
  const half = strokeWidth / 2;
  return {
    x: -half,
    y: -half,
    width: size.width + strokeWidth,
    height: size.height + strokeWidth,
    // Square corners stay square; rounded ones keep the same centre.
    cornerRadius: radius > 0 ? radius + half : 0,
    strokeWidth,
  };
}

/** Anything that can trace a path: a canvas 2D context or Konva's. */
export type PathContext = {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
  ): void;
  closePath(): void;
};

/** Traces a rounded rectangle at the origin (for clipping). */
export function roundedRectPath(
  context: PathContext,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.moveTo(r, 0);
  context.lineTo(width - r, 0);
  context.arc(width - r, r, r, -Math.PI / 2, 0);
  context.lineTo(width, height - r);
  context.arc(width - r, height - r, r, 0, Math.PI / 2);
  context.lineTo(r, height);
  context.arc(r, height - r, r, Math.PI / 2, Math.PI);
  context.lineTo(0, r);
  context.arc(r, r, r, Math.PI, Math.PI * 1.5);
  context.closePath();
}

// ---- Title bar details, all at unit 1 -------------------------------------

const LIGHTS = { radius: 6, gap: 8, left: 12 };
const DOTS = { radius: 3, gap: 5, left: 10 };
/** Width of each Windows caption button. */
const CAPTION = 46;

export type Dot = { x: number; y: number; radius: number; color: string };
export type TextBox = Box & { align: "left" | "center"; fontSize: number };

export type CaptionGlyphs = {
  minimise: number[];
  maximise: Box;
  close: [number[], number[]];
  strokeWidth: number;
};

export type ChromeLayout = {
  /** Traffic lights, or the minimal frame's dots. */
  dots: Dot[];
  /** Where `frame.title` goes. */
  title: TextBox | null;
  /** The browser's address bar. */
  address: (Box & { cornerRadius: number }) | null;
  /** Windows minimise, maximise and close. */
  captions: CaptionGlyphs | null;
  /** Hairline along the bottom of the bar. */
  separator: Box;
};

/**
 * How far a rounded corner of `radius` reaches in from the side, `y` px below
 * the top. Title-bar controls move in by this much to stay clear of it.
 */
export function cornerClearance(radius: number, y: number): number {
  const dy = radius - Math.max(0, y);
  if (!(radius > 0) || dy <= 0) return 0;
  return radius - Math.sqrt(radius * radius - dy * dy);
}

function rowOfDots(
  barHeight: number,
  unit: number,
  spec: { radius: number; gap: number; left: number },
  colors: readonly string[],
  edge = 0,
): Dot[] {
  const radius = spec.radius * unit;
  const pitch = 2 * radius + spec.gap * unit;
  return colors.map((color, i) => ({
    x: edge + spec.left * unit + radius + i * pitch,
    y: barHeight / 2,
    radius,
    color,
  }));
}

/** Right edge of the traffic lights. */
export function trafficLightsEnd(unit: number): number {
  return (LIGHTS.left + 6 * LIGHTS.radius + 2 * LIGHTS.gap) * unit;
}

export function trafficLights(
  barHeight: number,
  unit: number,
  edge = 0,
): Dot[] {
  return rowOfDots(barHeight, unit, LIGHTS, TRAFFIC_LIGHT_COLORS, edge);
}

/** The address pill, centred and about 60 % wide, clear of the traffic lights. */
export function addressPill(
  bar: Size,
  unit: number,
  edge = 0,
): (Box & { cornerRadius: number }) | null {
  const side = edge + trafficLightsEnd(unit) + 16 * unit;
  const width = Math.min(bar.width * 0.6, bar.width - 2 * side);
  if (width < 48 * unit) return null;
  const height = Math.max(0, Math.min(28 * unit, bar.height - 12 * unit));
  return {
    x: (bar.width - width) / 2,
    y: (bar.height - height) / 2,
    width,
    height,
    cornerRadius: height / 2,
  };
}

/** Windows minimise, maximise and close, right-aligned in the bar. */
function captionGlyphs(bar: Size, unit: number, edge: number): CaptionGlyphs {
  const half = 5 * unit;
  const centreY = bar.height / 2;
  const centreX = (index: number) =>
    bar.width - edge - (index + 0.5) * CAPTION * unit;
  const close = centreX(0);
  const maximise = centreX(1);
  const minimise = centreX(2);
  return {
    minimise: [minimise - half, centreY, minimise + half, centreY],
    maximise: {
      x: maximise - half,
      y: centreY - half,
      width: 2 * half,
      height: 2 * half,
    },
    close: [
      [close - half, centreY - half, close + half, centreY + half],
      [close - half, centreY + half, close + half, centreY - half],
    ],
    strokeWidth: unit,
  };
}

/** The Windows browser's address bar: from the left, up to the caption buttons. */
export function windowsAddressBar(
  bar: Size,
  unit: number,
  edge = 0,
): (Box & { cornerRadius: number }) | null {
  const left = edge + 12 * unit;
  const right = bar.width - edge - 3 * CAPTION * unit - 12 * unit;
  const width = right - left;
  if (width < 48 * unit) return null;
  const height = Math.max(0, Math.min(30 * unit, bar.height - 14 * unit));
  return {
    x: left,
    y: (bar.height - height) / 2,
    width,
    height,
    cornerRadius: height / 2,
  };
}

/**
 * The title-bar parts of a frame, or null for frames without one.
 * `cornerRadius` is the window's outer radius: the controls keep clear of it.
 */
export function chromeLayout(
  kind: FrameKind,
  bar: Size,
  unit: number,
  theme: FrameTheme,
  cornerRadius = 0,
): ChromeLayout | null {
  // Measured at the top of the tallest control, the traffic lights.
  const edge = cornerClearance(
    cornerRadius,
    bar.height / 2 - LIGHTS.radius * unit,
  );
  const hairline = unit;
  const separator = {
    x: 0,
    y: bar.height - hairline,
    width: bar.width,
    height: hairline,
  };
  const empty = { dots: [], title: null, address: null, captions: null };
  const fitText = (box: TextBox) => (box.width > box.fontSize ? box : null);

  switch (kind) {
    case "macos": {
      const margin = edge + trafficLightsEnd(unit) + 12 * unit;
      return {
        ...empty,
        dots: trafficLights(bar.height, unit, edge),
        // Symmetric margins keep the title centred on the window.
        title: fitText({
          x: margin,
          y: 0,
          width: bar.width - 2 * margin,
          height: bar.height,
          align: "center",
          fontSize: 13 * unit,
        }),
        separator,
      };
    }
    case "browser":
      return {
        ...empty,
        dots: trafficLights(bar.height, unit, edge),
        address: addressPill(bar, unit, edge),
        separator,
      };
    case "windows": {
      const left = edge + 14 * unit;
      return {
        ...empty,
        title: fitText({
          x: left,
          y: 0,
          width: bar.width - edge - 3 * CAPTION * unit - left - 8 * unit,
          height: bar.height,
          align: "left",
          fontSize: 12 * unit,
        }),
        captions: captionGlyphs(bar, unit, edge),
        separator,
      };
    }
    case "windows-browser":
      return {
        ...empty,
        address: windowsAddressBar(bar, unit, edge),
        captions: captionGlyphs(bar, unit, edge),
        separator,
      };
    case "minimal":
      return {
        ...empty,
        dots: rowOfDots(
          bar.height,
          unit,
          DOTS,
          Array<string>(3).fill(framePalette(theme).dot),
          edge,
        ),
        separator,
      };
    case "glass":
    case "none":
    case "phone":
    case "tablet":
    case "laptop":
      return null;
  }
}

export type LockGlyph = {
  /** The shackle: a stroked rounded box whose lower half the body covers. */
  shackle: StrokeBox;
  body: Box & { cornerRadius: number };
};

/** A padlock drawn from two rounded boxes, `left` px from the left, centred on `centreY`. */
export function lockGlyph(
  left: number,
  centreY: number,
  unit: number,
): LockGlyph {
  const top = centreY - 5.5 * unit;
  return {
    shackle: {
      x: left + 2 * unit,
      y: top,
      width: 5 * unit,
      height: 8 * unit,
      cornerRadius: 2.5 * unit,
      strokeWidth: 1.4 * unit,
    },
    body: {
      x: left,
      y: top + 4.5 * unit,
      width: 9 * unit,
      height: 6.5 * unit,
      cornerRadius: 1.5 * unit,
    },
  };
}

export const ADDRESS_FONT_SIZE = 13;

/**
 * The lock and the address inside the pill: centred together for the
 * measured `textWidth`, or from the left with `align` "left". Text too long
 * for the pill is cut off by the text box (which ends at the pill's padding),
 * not moved.
 */
export function addressContents(
  pill: Box,
  textWidth: number,
  unit: number,
  align: "center" | "left" = "center",
): { lock: LockGlyph; text: TextBox } {
  const lockWidth = 9 * unit;
  const gap = 6 * unit;
  const padding = 12 * unit;
  const room = Math.max(0, pill.width - 2 * padding - lockWidth - gap);
  const total = lockWidth + gap + Math.min(Math.max(0, textWidth), room);
  const start =
    align === "left" ? pill.x + padding : pill.x + (pill.width - total) / 2;
  const textX = start + lockWidth + gap;
  return {
    lock: lockGlyph(start, pill.y + pill.height / 2, unit),
    text: {
      x: textX,
      y: pill.y,
      width: Math.max(0, pill.x + pill.width - padding - textX),
      height: pill.height,
      align: "left",
      fontSize: ADDRESS_FONT_SIZE * unit,
    },
  };
}
