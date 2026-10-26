import { describe, expect, it } from "vitest";
import type { Annotation } from "./schema";
import { alignBox, snapMove, snapPoint, snapTargets } from "./snap";

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

describe("alignBox", () => {
  // The main screenshot's outline, and a phone beside it, taller than it.
  const shot = { x: -0.1, y: -0.1, width: 1.2, height: 0.8 };
  const phone = { width: 0.3, height: 0.9 };

  it("lines the middles up when close", () => {
    // The shot's middle is at 0.3; the phone's is at -0.13 + 0.45 = 0.32.
    const result = alignBox(phone, { x: 1.2, y: -0.13 }, shot, 0.05);
    expect(round(result)).toEqual({
      position: { x: 1.2, y: -0.15 },
      guides: { x: [], y: [0.3] },
    });
  });

  it("lines up tops or bottoms", () => {
    expect(round(alignBox(phone, { x: 1.2, y: -0.12 }, shot, 0.03))).toEqual({
      position: { x: 1.2, y: -0.1 },
      guides: { x: [], y: [-0.1] },
    });
    expect(round(alignBox(phone, { x: 1.2, y: -0.18 }, shot, 0.03))).toEqual({
      position: { x: 1.2, y: -0.2 },
      guides: { x: [], y: [0.7] },
    });
  });

  it("marks every line that is level, for a box as tall as the shot", () => {
    // Tops, middles and bottoms all line up at once.
    const result = alignBox(
      { width: 0.3, height: 0.8 },
      { x: 1.2, y: -0.11 },
      shot,
      0.05,
    );
    expect(round(result)).toEqual({
      position: { x: 1.2, y: -0.1 },
      guides: { x: [], y: [0.3, -0.1, 0.7] },
    });
  });

  it("centres it across, over the shot", () => {
    expect(round(alignBox(phone, { x: 0.34, y: 2 }, shot, 0.02))).toEqual({
      position: { x: 0.35, y: 2 },
      guides: { x: [0.5], y: [] },
    });
  });

  it("goes to the nearest of the top, middle and bottom when several are close", () => {
    // The phone's top, middle and bottom are 0.05 apart from the shot's.
    const at = (y: number) => round(alignBox(phone, { x: 1.2, y }, shot, 0.1));
    expect(at(-0.11)).toEqual({
      position: { x: 1.2, y: -0.1 },
      guides: { x: [], y: [-0.1] },
    });
    expect(at(-0.14)).toEqual({
      position: { x: 1.2, y: -0.15 },
      guides: { x: [], y: [0.3] },
    });
    expect(at(-0.19)).toEqual({
      position: { x: 1.2, y: -0.2 },
      guides: { x: [], y: [0.7] },
    });
  });

  it("lines the middles up on a tie", () => {
    // Halfway between the top and the middle being level.
    expect(round(alignBox(phone, { x: 1.2, y: -0.125 }, shot, 0.1))).toEqual({
      position: { x: 1.2, y: -0.15 },
      guides: { x: [], y: [0.3] },
    });
  });

  it("lines up down and across at once", () => {
    expect(round(alignBox(phone, { x: 0.34, y: -0.11 }, shot, 0.02))).toEqual({
      position: { x: 0.35, y: -0.1 },
      guides: { x: [0.5], y: [-0.1] },
    });
  });

  it("leaves it where it is when nothing is close", () => {
    expect(alignBox(phone, { x: 1.2, y: 0.5 }, shot, 0.01)).toEqual({
      position: { x: 1.2, y: 0.5 },
      guides: { x: [], y: [] },
    });
  });
});
