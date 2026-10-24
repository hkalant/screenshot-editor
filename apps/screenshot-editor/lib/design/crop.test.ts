import { describe, expect, it } from "vitest";
import {
  croppedSize,
  largestCrop,
  moveCrop,
  normalizeCrop,
  recropAnnotations,
  resizeCrop,
} from "./crop";
import type { Annotation } from "./schema";

const IMAGE = { width: 1000, height: 500 };
// The right half, top half: 500 x 250 px.
const QUARTER = { x: 0.5, y: 0, width: 0.5, height: 0.5 };

const step = (x: number, y: number): Annotation => ({
  id: `s${x}`,
  kind: "step",
  x,
  y,
  number: 1,
  color: "#d10373",
  size: 1,
});

const box = (
  shape: "rect" | "blur",
  x: number,
  y: number,
  width: number,
  height: number,
): Annotation => ({
  id: `${shape}${x}`,
  kind: "shape",
  shape,
  x,
  y,
  width,
  height,
  color: "#d10373",
  filled: false,
});

describe("normalizeCrop", () => {
  it("keeps the crop inside the image and at least 16 px", () => {
    expect(
      normalizeCrop({ x: 0.9, y: -0.2, width: 0.5, height: 0.001 }, IMAGE),
    ).toEqual({ x: 0.5, y: 0, width: 0.5, height: 0.032 });
  });

  it("treats the whole image as no crop", () => {
    expect(
      normalizeCrop({ x: 0.0002, y: 0, width: 0.9999, height: 1 }, IMAGE),
    ).toBeNull();
  });
});

describe("croppedSize", () => {
  it("is the crop in pixels", () => {
    expect(croppedSize(IMAGE, QUARTER)).toEqual({ width: 500, height: 250 });
    expect(croppedSize(IMAGE, null)).toEqual(IMAGE);
  });
});

describe("recropAnnotations", () => {
  it("keeps annotations over the same spot", () => {
    // At (0.75, 0.1) of the whole image: 750, 100 px. In the right half,
    // that's 250 px of 500 across and 100 down.
    const { annotations, removed } = recropAnnotations(
      [step(0.75, 0.1), box("rect", 0.6, 0.05, 0.2, 0.1)],
      null,
      QUARTER,
      IMAGE,
    );
    expect(removed).toBe(0);
    expect(annotations[0]).toMatchObject({ x: 0.5, y: 0.2, size: 1 });
    expect(annotations[1]).toMatchObject({
      x: 0.2,
      y: 0.1,
      width: 0.4,
      height: 0.2,
    });
  });

  it("goes back exactly when the crop is undone", () => {
    const start = [step(0.75, 0.1), box("rect", 0.6, 0.05, 0.2, 0.1)];
    const cropped = recropAnnotations(start, null, QUARTER, IMAGE);
    const back = recropAnnotations(cropped.annotations, QUARTER, null, IMAGE);
    expect(back.annotations).toEqual(start);
  });

  it("removes what was on the screenshot and is now cut off, and trims blur", () => {
    const { annotations, removed } = recropAnnotations(
      [
        step(0.2, 0.1),
        box("blur", 0.4, 0.1, 0.2, 0.1),
        // On the background, left of the screenshot: it stays.
        box("rect", -0.3, 0.1, 0.2, 0.1),
      ],
      null,
      QUARTER,
      IMAGE,
    );
    expect(removed).toBe(1);
    // The blur ran from 400 to 600 px; 500 to 600 is left.
    expect(annotations[0]).toMatchObject({
      shape: "blur",
      x: 0,
      width: 0.2,
    });
    expect(annotations[1]).toMatchObject({ shape: "rect", x: -1.6 });
  });
});

describe("resizeCrop", () => {
  const whole = { x: 0, y: 0, width: 1, height: 1 };

  it("moves the dragged sides, within the image", () => {
    expect(resizeCrop(whole, "nw", { x: 0.2, y: -0.5 }, IMAGE, null)).toEqual({
      x: 0.2,
      y: 0,
      width: 0.8,
      height: 1,
    });
    expect(resizeCrop(whole, "e", { x: 0.5, y: 0.9 }, IMAGE, null)).toEqual({
      x: 0,
      y: 0,
      width: 0.5,
      height: 1,
    });
  });

  it("keeps the shape from a corner", () => {
    // 2:1 like the image; dragging the bottom right in to (0.5, 0.9).
    const next = resizeCrop(whole, "se", { x: 0.5, y: 0.9 }, IMAGE, 2);
    // Across moved more: half the width, and the shape kept.
    expect(next.x).toBe(0);
    expect(next.width).toBeCloseTo(0.5);
    expect(next.height).toBeCloseTo(0.5);
    expect(
      (next.width * IMAGE.width) / (next.height * IMAGE.height),
    ).toBeCloseTo(2);
    // Up from the corner alone shrinks it too.
    const up = resizeCrop(whole, "se", { x: 1, y: 0.8 }, IMAGE, 2);
    expect(up.width).toBeCloseTo(0.8);
  });
});

describe("moveCrop", () => {
  it("stays inside the image", () => {
    expect(moveCrop(QUARTER, 0.3, -0.2)).toEqual(QUARTER);
    expect(moveCrop(QUARTER, -0.2, 0.2)).toEqual({
      ...QUARTER,
      x: 0.3,
      y: 0.2,
    });
  });
});

describe("largestCrop", () => {
  it("is the widest box of the shape, centred", () => {
    // 1:1 in a 1000 x 500 image: 500 px square in the middle.
    expect(largestCrop(IMAGE, 1)).toEqual({
      x: 0.25,
      y: 0,
      width: 0.5,
      height: 1,
    });
    expect(largestCrop(IMAGE, null)).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
  });
});
