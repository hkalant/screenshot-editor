import { describe, expect, it } from "vitest";
import { groupOffset, SNAP_DISTANCE, snapDrag } from "./snap";

const canvas = { width: 1000, height: 500 };

describe("snapDrag", () => {
  it("converts the centre to a fraction of the canvas", () => {
    const snap = snapDrag({ x: 250, y: 100 }, canvas, 1);
    expect(snap.centre).toEqual({ x: 250, y: 100 });
    expect(snap.position).toEqual({ x: 0.25, y: 0.2 });
    expect(snap.guides).toEqual({ vertical: false, horizontal: false });
  });

  it("snaps to each centre line within the screen distance", () => {
    const snap = snapDrag({ x: 500 + SNAP_DISTANCE, y: 250 - 2 }, canvas, 1);
    expect(snap.centre).toEqual({ x: 500, y: 250 });
    expect(snap.position).toEqual({ x: 0.5, y: 0.5 });
    expect(snap.guides).toEqual({ vertical: true, horizontal: true });

    const vertical = snapDrag({ x: 503, y: 100 }, canvas, 1);
    expect(vertical.guides).toEqual({ vertical: true, horizontal: false });
    expect(vertical.centre).toEqual({ x: 500, y: 100 });
  });

  it("measures the distance in screen pixels, whatever the zoom", () => {
    // At 50 % zoom, 6 screen px are 12 canvas px.
    expect(snapDrag({ x: 511, y: 0 }, canvas, 0.5).guides.vertical).toBe(true);
    expect(snapDrag({ x: 513, y: 0 }, canvas, 0.5).guides.vertical).toBe(false);
    // At 200 %, only 3 canvas px.
    expect(snapDrag({ x: 504, y: 0 }, canvas, 2).guides.vertical).toBe(false);
  });

  it("keeps the centre on the canvas", () => {
    const snap = snapDrag({ x: -40, y: 900 }, canvas, 1);
    expect(snap.centre).toEqual({ x: 0, y: 500 });
    expect(snap.position).toEqual({ x: 0, y: 1 });
  });

  it("survives a zero zoom", () => {
    expect(snapDrag({ x: 504, y: 0 }, canvas, 0).guides.vertical).toBe(true);
  });
});

describe("snapDrag with a second screenshot", () => {
  const canvas = { width: 1000, height: 500 };

  it("snaps the centre of both onto the centre lines", () => {
    // The group's centre is 150 px right of and 20 px below the shot's.
    const offset = { x: 150, y: 20 };
    const snap = snapDrag({ x: 352, y: 228 }, canvas, 1, SNAP_DISTANCE, offset);
    expect(snap.centre).toEqual({ x: 350, y: 230 });
    expect(snap.guides).toEqual({ vertical: true, horizontal: true });
    // The shot's own centre on the line no longer counts.
    expect(
      snapDrag({ x: 500, y: 250 }, canvas, 1, SNAP_DISTANCE, offset).guides,
    ).toEqual({ vertical: false, horizontal: false });
  });
});

describe("groupOffset", () => {
  const round = (point: { x: number; y: number }) => ({
    x: Math.round(point.x * 1000) / 1000,
    y: Math.round(point.y * 1000) / 1000,
  });

  it("is nothing without a second screenshot", () => {
    expect(groupOffset(400, 300, 0, [])).toEqual({ x: 0, y: 0 });
  });

  it("finds the middle of both", () => {
    // A shot 400 wide, and one as big 100 px to its right: 900 across.
    const second = { x: 500, y: 0, width: 400, height: 300 };
    expect(groupOffset(400, 300, 0, [second])).toEqual({ x: 250, y: 0 });
  });

  it("turns with the shot", () => {
    const second = { x: 500, y: 0, width: 400, height: 300 };
    expect(round(groupOffset(400, 300, 90, [second]))).toEqual({
      x: 0,
      y: 250,
    });
  });
});
