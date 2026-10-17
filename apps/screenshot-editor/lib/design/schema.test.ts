import { describe, expect, it } from "vitest";
import {
  createDefaultDesign,
  defaultBackground,
  defaultShotStyle,
} from "./defaults";
import { migrateDesign } from "./migrate";
import { referencedImageIds } from "./refs";
import { designSchema, type Design } from "./schema";

const valid = (design: unknown) => designSchema.safeParse(design).success;

function withShot(patch: Record<string, unknown>): unknown {
  const design = createDefaultDesign();
  return { ...design, layers: [{ ...design.layers[0], ...patch }] };
}

describe("design schema", () => {
  it("accepts the default design", () => {
    expect(valid(createDefaultDesign())).toBe(true);
  });

  it("rejects out-of-range values", () => {
    expect(valid(withShot({ padding: 500 }))).toBe(false);
    expect(valid(withShot({ scale: 2 }))).toBe(false);
    expect(valid(withShot({ rotation: 90 }))).toBe(false);
    expect(valid(withShot({ position: { x: 1.5, y: 0.5 } }))).toBe(false);
    expect(
      valid(withShot({ frame: { ...defaultShotStyle().frame, kind: "tv" } })),
    ).toBe(false);
    expect(
      valid(
        withShot({
          frame: { ...defaultShotStyle().frame, title: "x".repeat(121) },
        }),
      ),
    ).toBe(false);

    const design = createDefaultDesign();
    expect(
      valid({
        ...design,
        background: { kind: "linear", presetId: null, angle: 360, stops: [] },
      }),
    ).toBe(false);
    expect(
      valid({ ...design, background: { kind: "solid", color: "red" } }),
    ).toBe(false);
    expect(
      valid({
        ...design,
        canvas: { preset: "custom", width: 50, height: 900 },
      }),
    ).toBe(false);
    expect(
      valid({
        ...design,
        canvas: { preset: "huge", width: 1000, height: 900 },
      }),
    ).toBe(false);
  });

  it("accepts every background kind", () => {
    const design = createDefaultDesign();
    const backgrounds: Design["background"][] = [
      { kind: "solid", color: "#123abc" },
      {
        kind: "radial",
        presetId: null,
        stops: [
          { offset: 0, color: "#000000" },
          { offset: 1, color: "#ffffff" },
        ],
      },
      { kind: "image", source: { type: "upload", imageId: "img-1" } },
      { kind: "image", source: { type: "wallpaper", wallpaperId: "waves" } },
      { kind: "fromImage", angle: 90 },
      { kind: "transparent" },
    ];
    for (const background of backgrounds)
      expect(valid({ ...design, background }), background.kind).toBe(true);
  });

  it("requires exactly one layer", () => {
    const design = createDefaultDesign();
    expect(valid({ ...design, layers: [] })).toBe(false);
    expect(
      valid({ ...design, layers: [design.layers[0], design.layers[0]] }),
    ).toBe(false);
  });

  it("creates independent copies", () => {
    const a = createDefaultDesign();
    const b = createDefaultDesign();
    if (a.background.kind === "linear") a.background.stops[0].color = "#000000";
    a.layers[0].position.x = 0;
    expect(b).toEqual(createDefaultDesign());
  });
});

describe("migrateDesign", () => {
  it("keeps a current design", () => {
    const design = createDefaultDesign();
    expect(migrateDesign(design)).toEqual(design);
  });

  it("upgrades a milestone 1 design, filling new fields with defaults", () => {
    const current = createDefaultDesign();
    const v1 = {
      version: 1,
      canvas: { preset: "auto" },
      background: current.background,
      layers: [
        {
          id: "shot-1",
          kind: "shot",
          imageId: "img-1",
          padding: 100,
          radius: 20,
          shadow: { ...current.layers[0].shadow, preset: "soft" },
        },
      ],
    };
    const migrated = migrateDesign(v1);
    expect(migrated?.version).toBe(2);
    expect(migrated?.layers[0]).toMatchObject({
      imageId: "img-1",
      padding: 100,
      radius: 20,
      scale: 1,
      rotation: 0,
      frame: { kind: "none" },
    });
    expect(migrated?.backgroundFx).toEqual({ blur: 0 });
  });

  it("drops the removed noise setting from saved designs", () => {
    const design = createDefaultDesign();
    const saved = { ...design, backgroundFx: { noise: 0.4, blur: 3 } };
    expect(migrateDesign(saved)?.backgroundFx).toEqual({ blur: 3 });
  });

  it("gives a design saved with a mesh background the default background", () => {
    const saved = {
      ...createDefaultDesign(),
      background: { kind: "mesh", presetId: "candy" },
    };
    expect(migrateDesign(saved)?.background).toEqual(defaultBackground());
  });

  it("keeps the size of a removed size preset as a custom size", () => {
    const saved = {
      ...createDefaultDesign(),
      canvas: { preset: "dribbble", width: 1600, height: 1200 },
    };
    expect(migrateDesign(saved)?.canvas).toEqual({
      preset: "custom",
      width: 1600,
      height: 1200,
    });
  });

  it("gives arrows in retired styles the styles that replaced them", () => {
    const arrow = (style: string) => ({
      id: style,
      kind: "arrow",
      x: 0.1,
      y: 0.1,
      dx: 0.2,
      dy: 0.1,
      color: "#d10373",
      style,
    });
    const design = migrateDesign({
      ...createDefaultDesign(),
      annotations: [
        arrow("tapered"),
        arrow("chevron"),
        arrow("refined"),
        arrow("dotted"),
      ],
    });
    expect(
      design?.annotations.map((item) => item.kind === "arrow" && item.style),
    ).toEqual(["solid", "bold", "solid", "dotted"]);
  });

  it("returns null for anything invalid", () => {
    expect(migrateDesign(null)).toBeNull();
    expect(migrateDesign({ version: 3 })).toBeNull();
    expect(migrateDesign({ ...createDefaultDesign(), layers: [] })).toBeNull();
  });
});

describe("referencedImageIds", () => {
  it("lists the screenshot and an uploaded background", () => {
    const design = createDefaultDesign();
    expect(referencedImageIds(design)).toEqual([]);
    const withImages: Design = {
      ...design,
      background: { kind: "image", source: { type: "upload", imageId: "bg" } },
      layers: [{ ...design.layers[0], imageId: "shot" }],
    };
    expect(referencedImageIds(withImages)).toEqual(["shot", "bg"]);
  });
});
