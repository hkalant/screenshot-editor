import { describe, expect, it } from "vitest";
import { deviceGeometry, DEVICE_KINDS, suggestDevice } from "./devices";

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

describe("suggestDevice", () => {
  it("suggests a device from the screenshot's shape", () => {
    expect(suggestDevice({ width: 1179, height: 2556 })).toBe("phone");
    expect(suggestDevice({ width: 750, height: 1334 })).toBe("phone");
    expect(suggestDevice({ width: 2556, height: 1179 })).toBe("phone");
    expect(suggestDevice({ width: 1640, height: 2360 })).toBe("tablet");
    expect(suggestDevice({ width: 2048, height: 1536 })).toBe("tablet");
    expect(suggestDevice({ width: 2880, height: 1800 })).toBe("laptop");
    expect(suggestDevice({ width: 1920, height: 1080 })).toBe("laptop");
  });

  it("suggests nothing when the shape doesn't say", () => {
    expect(suggestDevice({ width: 1000, height: 1000 })).toBeNull();
    expect(suggestDevice({ width: 3440, height: 1440 })).toBeNull();
    expect(suggestDevice({ width: 0, height: 0 })).toBeNull();
  });
});
