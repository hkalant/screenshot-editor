import { describe, expect, it } from "vitest";
import type { Annotation } from "./schema";
import { snapMove, snapPoint, snapTargets } from "./snap";

/** Points rounded clear of floating-point noise. */
const round = (value: unknown): unknown =>
  typeof value === "number"
    ? Math.round(value * 1e6) / 1e6
    : Array.isArray(value)
      ? value.map(round)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, round(item)]),
          )
        : value;

const line: Annotation = {
  id: "l",
  kind: "arrow",
  x: 0.1,
  y: 0.1,
  dx: 0.4,
  dy: 0,
  color: "#d10373",
  style: "flat",
  bend: 0,
};
const step: Annotation = {
  id: "s",
  kind: "step",
  x: 0.49,
  y: 0.11,
  number: 1,
  color: "#d10373",
  size: 1,
};
const box: Annotation = {
  id: "b",
  kind: "shape",
  shape: "rect",
  x: 0.2,
  y: 0.2,
  width: 0.2,
  height: 0.1,
  color: "#d10373",
  filled: false,
};

describe("snapTargets", () => {
  it("is a line's ends and middle", () => {
    expect(round(snapTargets(line))).toEqual([
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.1 },
      { x: 0.3, y: 0.1 },
    ]);
  });

  it("is a box's centre, corners and the middles of its sides", () => {
    const targets = snapTargets(box);
    expect(targets).toHaveLength(9);
    expect(round(targets[0])).toEqual({ x: 0.3, y: 0.25 });
  });
});

describe("snapPoint", () => {
  it("picks the nearest target within the distance", () => {
    expect(snapPoint({ x: 0.49, y: 0.1 }, snapTargets(line), 0.02)).toEqual({
      x: 0.5,
      y: 0.1,
    });
    expect(snapPoint({ x: 0.45, y: 0.1 }, snapTargets(line), 0.02)).toBeNull();
  });
});

describe("snapMove", () => {
  it("centres a step on the end of a line", () => {
    expect(
      round(snapMove(step, { x: 0.49, y: 0.11 }, snapTargets(line), 0.02)),
    ).toEqual({ position: { x: 0.5, y: 0.1 }, target: { x: 0.5, y: 0.1 } });
  });

  it("moves a box so its centre lands on a target", () => {
    const moved = snapMove(
      box,
      { x: 0.395, y: 0.055 },
      [{ x: 0.5, y: 0.1 }],
      0.02,
    );
    expect(moved.position.x).toBeCloseTo(0.4);
    expect(moved.position.y).toBeCloseTo(0.05);
  });

  it("stays put with nothing near", () => {
    expect(snapMove(step, { x: 0.3, y: 0.4 }, snapTargets(line), 0.02)).toEqual(
      {
        position: { x: 0.3, y: 0.4 },
        target: null,
      },
    );
  });
});
