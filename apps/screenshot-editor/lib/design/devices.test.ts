import { describe, expect, it } from "vitest";
import {
  deviceGeometry,
  DEVICE_KINDS,
  fittingDevices,
  frameFits,
  frameForScreenshot,
} from "./devices";

describe("deviceGeometry", () => {
  it("puts the screen inside an even phone bezel", () => {
    const phone = deviceGeometry("phone", { width: 1000, height: 2000 });
    expect(phone.screen).toMatchObject({
      x: 36,
      y: 36,
      width: 1000,
      height: 2000,
    });
    expect(phone).toMatchObject({ width: 1072, height: 2072, stand: [] });
    // The screen's corners follow the body's, less the bezel.
    expect(phone.body.radii).toEqual([145, 145, 145, 145]);
    expect(phone.screen.radii).toEqual([109, 109, 109, 109]);
  });

  it("moves the phone's speaker to the left edge on its side", () => {
    const upright = deviceGeometry("phone", { width: 1000, height: 2000 });
    const sideways = deviceGeometry("phone", { width: 2000, height: 1000 });
    const [top] = upright.details;
    const [left] = sideways.details;
    expect(top.width).toBeGreaterThan(top.height);
    expect(top.x + top.width / 2).toBe(upright.width / 2);
    expect(left.height).toBeGreaterThan(left.width);
    expect(left.y + left.height / 2).toBe(sideways.height / 2);
  });

  it("sits a laptop on a base wider than its screen", () => {
    const laptop = deviceGeometry("laptop", { width: 1600, height: 1000 });
    expect(laptop.body).toMatchObject({ x: 100, y: 0, width: 1656 });
    expect(laptop.screen).toMatchObject({ x: 128, y: 34 });
    expect(laptop.stand).toEqual([
      expect.objectContaining({ x: 0, y: 1062, width: 1856, height: 46 }),
    ]);
    expect(laptop).toMatchObject({ width: 1856, height: 1108 });
  });

  it("stands a monitor on a centred neck and foot", () => {
    const monitor = deviceGeometry("monitor", { width: 1600, height: 900 });
    const [neck, foot] = monitor.stand;
    expect(monitor.width).toBe(monitor.body.width);
    expect(neck.x + neck.width / 2).toBe(monitor.width / 2);
    expect(foot.x + foot.width / 2).toBe(monitor.width / 2);
    expect(foot.y + foot.height).toBe(monitor.height);
  });

  it("looks the same at any resolution", () => {
    for (const kind of DEVICE_KINDS) {
      const small = deviceGeometry(kind, { width: 800, height: 500 });
      const large = deviceGeometry(kind, { width: 3200, height: 2000 });
      expect(large.width / small.width).toBeCloseTo(4, 1);
      expect(large.height / small.height).toBeCloseTo(4, 1);
    }
  });
});

describe("fittingDevices", () => {
  it("fits devices to the screenshot's shape, best first", () => {
    expect(fittingDevices({ width: 1179, height: 2556 })).toEqual(["phone"]);
    expect(fittingDevices({ width: 750, height: 1334 })).toEqual(["phone"]);
    expect(fittingDevices({ width: 2556, height: 1179 })).toEqual(["phone"]);
    expect(fittingDevices({ width: 1640, height: 2360 })).toEqual(["tablet"]);
    expect(fittingDevices({ width: 2048, height: 1536 })).toEqual(["tablet"]);
    expect(fittingDevices({ width: 2880, height: 1800 })).toEqual([
      "laptop",
      "monitor",
    ]);
    expect(fittingDevices({ width: 1920, height: 1080 })).toEqual([
      "laptop",
      "monitor",
    ]);
    expect(fittingDevices({ width: 3440, height: 1440 })).toEqual(["monitor"]);
  });

  it("fits none to a shape that is no screen's", () => {
    expect(fittingDevices({ width: 1000, height: 1000 })).toEqual([]);
    expect(fittingDevices({ width: 0, height: 0 })).toEqual([]);
  });
});

describe("frameFits", () => {
  it("keeps window frames off phone screenshots only", () => {
    const phone = { width: 1179, height: 2556 };
    expect(frameFits("browser", phone)).toBe(false);
    expect(frameFits("none", phone)).toBe(true);
    expect(frameFits("browser", { width: 2048, height: 1536 })).toBe(true);
    expect(frameFits("browser", { width: 1000, height: 1000 })).toBe(true);
  });
});

describe("frameForScreenshot", () => {
  const laptopShot = { width: 1920, height: 1080 };
  it("keeps window frames and devices that still fit", () => {
    expect(frameForScreenshot("macos", laptopShot)).toBe("macos");
    expect(frameForScreenshot("monitor", laptopShot)).toBe("monitor");
  });

  it("swaps a device that no longer fits for the best one that does", () => {
    expect(frameForScreenshot("phone", laptopShot)).toBe("laptop");
    expect(frameForScreenshot("browser", { width: 1179, height: 2556 })).toBe(
      "phone",
    );
    expect(frameForScreenshot("laptop", { width: 600, height: 600 })).toBe(
      "none",
    );
  });
});
