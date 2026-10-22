// Sizes are in design pixels unless the name says otherwise.

/** Screenshots are shrunk (never enlarged) so their longest side fits this. */
export const MAX_DESIGN_SIDE = 1600;

export const PADDING = { min: 0, max: 200, step: 4, default: 72 } as const;
export const RADIUS = { min: 0, max: 64, step: 1, default: 15 } as const;
export const ANGLE = { min: 0, max: 359, step: 1 } as const;

/** Size of the shot on a fixed canvas, relative to "fits inside the padding". */
export const SHOT_SCALE = {
  min: 0.2,
  max: 1.5,
  /**
   * The largest a resize goes: fitting inside the padding, so the shot isn't
   * cropped. Older designs may be saved larger, up to max.
   */
  fit: 1,
  step: 0.01,
  default: 1,
} as const;
export const ROTATION = { min: -45, max: 45, step: 1, default: 0 } as const;

export const BORDER_WIDTH = { min: 0, max: 24, step: 1 } as const;
export const OPACITY = { min: 0, max: 1, step: 0.01 } as const;

/** Ranges for hand-tuned shadows. */
export const SHADOW_OFFSET = { min: -100, max: 100, step: 1 } as const;
export const SHADOW_BLUR = { min: 0, max: 120, step: 1 } as const;

export const BLUR = { min: 0, max: 40, step: 1 } as const;

/** Window title and address bar text. */
export const MAX_FRAME_TEXT = 120;

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Larger images are rejected before they are decoded, to protect memory. */
export const MAX_SOURCE_PIXELS = 50_000_000;

/** Sources bigger than this are downscaled on load: twice the largest design side. */
export const MAX_SOURCE_SIDE = MAX_DESIGN_SIDE * 2;

/** Safari refuses canvases larger than 4096 x 4096 pixels in area. */
export const MAX_CANVAS_AREA = 16_777_216;
export const MAX_CANVAS_SIDE = 16_384;
