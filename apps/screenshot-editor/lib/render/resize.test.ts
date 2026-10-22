import { describe, expect, it } from "vitest";
import { resizeFromCorner } from "./resize";

// A 1000 x 500 shot centred on a 1600 x 900 canvas, at its fitted size.
const canvas = { width: 1600, height: 900 };
const box = { x: 300, y: 200, width: 1000, height: 500 };

describe("resizeFromCorner", () => {
  it("keeps the opposite corner where it was", () => {
    const next = resizeFromCorner(
      box,
      1,
      { x: 1, y: 1 },
      { x: 800, y: 450 },
      canvas,
    );
    expect(next.scale).toBeCloseTo(0.5);
    // Top-left stays at (300, 200): the centre is half the new size from it.
    expect(next.position.x * canvas.width).toBeCloseTo(300 + 250);
    expect(next.position.y * canvas.height).toBeCloseTo(200 + 125);
  });

  it("follows the pointer along the diagonal from any corner", () => {
    const next = resizeFromCorner(
      box,
      1,
      { x: -1, y: -1 },
      { x: 800, y: 450 },
      canvas,
    );
    expect(next.scale).toBeCloseTo(0.5);
    expect(next.position.x * canvas.width).toBeCloseTo(1300 - 250);
    expect(next.position.y * canvas.height).toBeCloseTo(700 - 125);
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
      { x: 0, y: 0 },
      canvas,
    );
    expect(next.scale).toBe(0.2);
  });
});
