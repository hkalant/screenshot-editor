import { describe, expect, it } from "vitest";
import { resizeFromCorner } from "./resize";

// A 1000 x 500 shot centred on a 1600 x 900 canvas, at its fitted size.
const canvas = { width: 1600, height: 900 };
const box = { x: 300, y: 200, width: 1000, height: 500 };

describe("resizeFromCorner", () => {
  it("keeps the centre where it was", () => {
    // Halfway from the centre (800, 450) to the bottom-right (1300, 700).
    const next = resizeFromCorner(
      box,
      1,
      { x: 1, y: 1 },
      { x: 1050, y: 575 },
      canvas,
    );
    expect(next.scale).toBeCloseTo(0.5);
    expect(next.position.x * canvas.width).toBeCloseTo(800);
    expect(next.position.y * canvas.height).toBeCloseTo(450);
  });

  it("follows the pointer along the diagonal from any corner", () => {
    // Halfway from the centre to the top-left (300, 200).
    const next = resizeFromCorner(
      box,
      1,
      { x: -1, y: -1 },
      { x: 550, y: 325 },
      canvas,
    );
    expect(next.scale).toBeCloseTo(0.5);
    expect(next.position.x * canvas.width).toBeCloseTo(800);
    expect(next.position.y * canvas.height).toBeCloseTo(450);
  });

  it("doesn't jump when the drag starts on the corner", () => {
    const next = resizeFromCorner(
      box,
      1,
      { x: 1, y: -1 },
      { x: 1300, y: 200 },
      canvas,
    );
    expect(next.scale).toBeCloseTo(1);
  });

  it("grows past the canvas edge, up to half as big again as fitting", () => {
    const small = { x: 300, y: 200, width: 500, height: 250 };
    const next = resizeFromCorner(
      small,
      0.5,
      { x: 1, y: 1 },
      { x: 5000, y: 5000 },
      canvas,
    );
    expect(next.scale).toBe(1.5);
  });

  it("doesn't shrink past the smallest size", () => {
    const next = resizeFromCorner(
      box,
      1,
      { x: 1, y: 1 },
      { x: 800, y: 450 },
      canvas,
    );
    expect(next.scale).toBe(0.2);
  });
});
