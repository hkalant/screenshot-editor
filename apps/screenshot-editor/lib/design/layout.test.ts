import { describe, expect, it } from "vitest";
import { createDefaultDesign } from "./defaults";
import {
  computeLayout,
  computePreviewScale,
  fitWithin,
  MIN_PREVIEW_SCALE,
} from "./layout";
import {
  MAX_CANVAS_AREA,
  MAX_CANVAS_SIDE,
  MAX_DESIGN_SIDE,
  PADDING,
} from "./limits";
import type { Design, FrameKind, ShotLayer } from "./schema";

describe("fitWithin", () => {
  it("never enlarges", () => {
    expect(fitWithin({ width: 800, height: 600 }, 1600)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("shrinks the longest side to the limit", () => {
    expect(fitWithin({ width: 3200, height: 2000 }, 1600)).toEqual({
      width: 1600,
      height: 1000,
    });
    expect(fitWithin({ width: 900, height: 2880 }, 1600)).toEqual({
      width: 500,
      height: 1600,
    });
  });

  it("rounds to whole pixels and keeps very thin images at least 1px", () => {
    expect(fitWithin({ width: 2999, height: 1001 }, 1600)).toEqual({
      width: 1600,
      height: 534,
    });
    expect(fitWithin({ width: 10000, height: 2 }, 1600)).toEqual({
      width: 1600,
      height: 1,
    });
  });
});

function design(
  shotPatch: Partial<ShotLayer> = {},
  canvas: Design["canvas"] = { preset: "auto" },
): Design {
  const base = createDefaultDesign();
  return { ...base, canvas, layers: [{ ...base.layers[0], ...shotPatch }] };
}

const frame = (kind: FrameKind): ShotLayer["frame"] => ({
  kind,
  theme: "light",
  title: "",
  url: "",
});

describe("computeLayout on an auto canvas", () => {
  it("adds padding on every side", () => {
    const { canvas, shot, draggable } = computeLayout(
      { width: 1200, height: 750 },
      design(),
    );
    expect(canvas).toEqual({ width: 1344, height: 894 });
    expect(shot).toMatchObject({ x: 72, y: 72, width: 1200, height: 750 });
    expect(shot.image).toEqual({ x: 0, y: 0, width: 1200, height: 750 });
    expect(shot.radius).toBe(15);
    expect(shot.imageRadii).toEqual([15, 15, 15, 15]);
    expect(shot.chrome).toBeNull();
    expect(draggable).toBe(false);
  });

  it("fits large screenshots before padding", () => {
    const layout = computeLayout({ width: 4000, height: 2500 }, design());
    expect(layout.canvas).toEqual({ width: 1744, height: 1144 });
  });

  it("caps the radius at half the shorter side", () => {
    const layout = computeLayout(
      { width: 40, height: 20 },
      design({ padding: 0, radius: 64 }),
    );
    expect(layout.shot.radius).toBe(10);
  });

  it("ignores scale and position", () => {
    const layout = computeLayout(
      { width: 400, height: 300 },
      design({ scale: 0.5, position: { x: 0, y: 1 } }),
    );
    expect(layout.shot).toMatchObject({
      x: 72,
      y: 72,
      width: 400,
      height: 300,
    });
  });

  it("adds a title bar above the content, with square top corners below it", () => {
    const { shot } = computeLayout(
      { width: 1000, height: 600 },
      design({ frame: frame("macos") }),
    );
    expect(shot.chrome).toEqual({ x: 0, y: 0, width: 1000, height: 34 });
    expect(shot.image).toEqual({ x: 0, y: 34, width: 1000, height: 600 });
    expect(shot.height).toBe(634);
    expect(shot.imageRadii).toEqual([0, 0, 15, 15]);
  });

  it("puts a device around the screenshot, with the device's corners", () => {
    const { shot, canvas } = computeLayout(
      { width: 500, height: 1000 },
      design({ frame: frame("phone"), radius: 24 }),
    );
    expect(canvas).toEqual({ width: 536 + 144, height: 1036 + 144 });
    expect(shot.image).toMatchObject({ x: 18, y: 18, width: 500 });
    expect(shot.imageRadii).toEqual([55, 55, 55, 55]);
    expect(shot.radius).toBe(0);
    expect(shot.chrome).toBeNull();
    expect(shot.device?.body.width).toBe(536);
  });

  it("puts the glass ring around everything", () => {
    const { shot } = computeLayout(
      { width: 1000, height: 600 },
      design({ frame: frame("glass"), radius: 24 }),
    );
    expect(shot.width).toBe(1020);
    expect(shot.image).toEqual({ x: 10, y: 10, width: 1000, height: 600 });
    expect(shot.imageRadii).toEqual([14, 14, 14, 14]);
  });

  it("sizes frame chrome by the screenshot's width", () => {
    const small = computeLayout(
      { width: 300, height: 200 },
      design({ frame: frame("browser") }),
    );
    const large = computeLayout(
      { width: 1600, height: 1000 },
      design({ frame: frame("browser") }),
    );
    expect(small.shot.chrome?.height).toBe(Math.round(48 * 0.6));
    expect(large.shot.chrome?.height).toBe(Math.round(48 * 1.6));
  });
});

describe("computeLayout on a fixed canvas", () => {
  const fixed = { preset: "custom", width: 1600, height: 900 } as const;

  it("fits the framed shot inside the padding and centres it", () => {
    const { canvas, shot, draggable } = computeLayout(
      { width: 1200, height: 600 },
      design({ padding: 100 }, fixed),
    );
    expect(canvas).toEqual({ width: 1600, height: 900 });
    expect(draggable).toBe(true);
    // 1400 x 700 available: the 2:1 shot fills it exactly.
    expect(shot.scale).toBeCloseTo(1400 / 1200);
    expect(shot).toMatchObject({ x: 100, y: 100 });
    expect(shot.width).toBeCloseTo(1400);
    expect(shot.height).toBeCloseTo(700);
  });

  it("scales a device with the shot", () => {
    const { shot } = computeLayout(
      { width: 1600, height: 1000 },
      design({ padding: 100, frame: frame("laptop") }, fixed),
    );
    // The 1856 x 1108 laptop fits the 700 px tall space.
    expect(shot.scale).toBeCloseTo(700 / 1108);
    expect(shot.height).toBeCloseTo(700);
    expect(shot.device?.stand[0].width).toBeCloseTo(shot.width);
    expect(shot.image.width).toBeCloseTo(1600 * shot.scale);
  });

  it("scales and moves the shot", () => {
    const { shot } = computeLayout(
      { width: 1200, height: 600 },
      design(
        { padding: 100, scale: 0.5, position: { x: 0.25, y: 0.5 } },
        fixed,
      ),
    );
    expect(shot.width).toBeCloseTo(700);
    expect(shot.x).toBeCloseTo(400 - 350);
    expect(shot.y).toBeCloseTo(450 - 175);
  });

  it("scales the frame with the shot, but not the radius", () => {
    const { shot } = computeLayout(
      { width: 1000, height: 500 },
      design(
        { padding: 0, radius: 12, frame: frame("glass") },
        { preset: "custom", width: 510, height: 260 },
      ),
    );
    expect(shot.scale).toBeCloseTo(0.5);
    expect(shot.image.x).toBeCloseTo(5);
    expect(shot.radius).toBe(12);
  });
});

describe("auto canvas size", () => {
  it("stays under the browser side limit at 4x for the largest unframed shot", () => {
    // Bigger frames or exports are capped by safePixelRatio instead.
    const side = MAX_DESIGN_SIDE + 2 * PADDING.max;
    expect(side * 4).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
    expect((side * 2) ** 2).toBeLessThanOrEqual(MAX_CANVAS_AREA);
  });
});

describe("computePreviewScale", () => {
  it("never goes above 1", () => {
    expect(
      computePreviewScale(
        { width: 4000, height: 4000 },
        { width: 400, height: 300 },
      ),
    ).toBe(1);
  });

  it("fits the canvas inside the container minus the margin", () => {
    expect(
      computePreviewScale(
        { width: 864, height: 2000 },
        { width: 1600, height: 1000 },
        32,
      ),
    ).toBe(0.5);
    expect(
      computePreviewScale(
        { width: 2000, height: 564 },
        { width: 1600, height: 1000 },
        32,
      ),
    ).toBe(0.5);
  });

  it("shrinks a large canvas into a small container without clipping it", () => {
    // 86 / 4000: under the old 5% floor, which drew the canvas too big.
    expect(
      computePreviewScale(
        { width: 150, height: 150 },
        { width: 4000, height: 4000 },
      ),
    ).toBeCloseTo(0.0215);
    expect(MIN_PREVIEW_SCALE).toBeLessThanOrEqual(0.01);
  });

  it("returns the minimum for tiny or unmeasured containers", () => {
    expect(
      computePreviewScale({ width: 0, height: 0 }, { width: 100, height: 100 }),
    ).toBe(MIN_PREVIEW_SCALE);
    expect(
      computePreviewScale(
        { width: 70, height: 70 },
        { width: 10000, height: 10000 },
      ),
    ).toBe(MIN_PREVIEW_SCALE);
  });
});
