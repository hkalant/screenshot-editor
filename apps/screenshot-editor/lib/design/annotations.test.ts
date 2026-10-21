import { describe, expect, it } from "vitest";
import {
  annotationWeight,
  clickArrow,
  clickBox,
  dragBox,
  fitArrow,
  fitBox,
  imageArea,
  canvasArea,
  isAnnotationColor,
  MAX_WEIGHT_ASPECT,
  parseStepNumber,
  stepTextColor,
  snapEnd,
} from "./annotations";
import { migrateDesign } from "./migrate";
import { createDefaultDesign } from "./defaults";
import { designSchema } from "./schema";

describe("annotation colours", () => {
  it("allows only the three Oxford Brookes colours", () => {
    expect(isAnnotationColor("#424a52")).toBe(true);
    expect(isAnnotationColor("#d10373")).toBe(true);
    expect(isAnnotationColor("#f9c909")).toBe(true);
    expect(isAnnotationColor("#ff0000")).toBe(false);
    expect(isAnnotationColor("#D10373")).toBe(false);
  });

  it("puts a dark number on yellow and a white one on the others", () => {
    expect(stepTextColor("#f9c909")).toBe("#424a52");
    expect(stepTextColor("#d10373")).toBe("#ffffff");
  });

  it("rejects a design with any other colour", () => {
    const design = createDefaultDesign();
    const step = {
      id: "a",
      kind: "step",
      x: 0.5,
      y: 0.2,
      number: 1,
      color: "#00ff00",
    };
    expect(
      designSchema.safeParse({ ...design, annotations: [step] }).success,
    ).toBe(false);
    expect(
      designSchema.safeParse({
        ...design,
        annotations: [{ ...step, color: "#424a52" }],
      }).success,
    ).toBe(true);
  });
});

describe("annotationWeight", () => {
  it("follows the longer side, up to a limit", () => {
    expect(annotationWeight(0.5)).toBe(1);
    expect(annotationWeight(1)).toBe(1);
    expect(annotationWeight(2.17)).toBe(2.17);
    expect(annotationWeight(6)).toBe(MAX_WEIGHT_ASPECT);
    expect(annotationWeight(Number.NaN)).toBe(1);
  });
});

describe("parseStepNumber", () => {
  it("takes whole numbers from 1 to 999 only", () => {
    expect(parseStepNumber("7")).toBe(7);
    expect(parseStepNumber(" 12 ")).toBe(12);
    expect(parseStepNumber("999")).toBe(999);
    expect(parseStepNumber("0")).toBeNull();
    expect(parseStepNumber("1000")).toBeNull();
    expect(parseStepNumber("3a")).toBeNull();
    expect(parseStepNumber("A")).toBeNull();
    expect(parseStepNumber("1.5")).toBeNull();
    expect(parseStepNumber("")).toBeNull();
  });

  it("is enforced by the design schema", () => {
    const design = createDefaultDesign();
    const step = (number: unknown) => ({
      ...design,
      annotations: [
        { id: "a", kind: "step", x: 0, y: 0, number, color: "#424a52" },
      ],
    });
    expect(designSchema.safeParse(step(3)).success).toBe(true);
    expect(designSchema.safeParse(step("3")).success).toBe(false);
    expect(designSchema.safeParse(step("A")).success).toBe(false);
    expect(designSchema.safeParse(step(2.5)).success).toBe(false);
  });
});

describe("shape boxes", () => {
  // A screenshot half as tall as it is wide.
  const aspect = imageArea(0.5);

  it("drags out a box in any direction, kept on the screenshot", () => {
    expect(
      dragBox({ x: 0.5, y: 0.2 }, { x: 0.2, y: 0.1 }, "rect", aspect),
    ).toEqual({ x: 0.2, y: 0.1, width: 0.3, height: 0.1 });
    const box = dragBox({ x: 0.5, y: 0.2 }, { x: 2, y: 2 }, "rounded", aspect);
    expect(box.x + box.width).toBe(1);
    expect(box.y + box.height).toBe(0.5);
  });

  it("keeps a circle's box square and on the screenshot", () => {
    const box = dragBox(
      { x: 0.2, y: 0.1 },
      { x: 0.3, y: 0.4 },
      "circle",
      aspect,
    );
    expect(box.width).toBeCloseTo(box.height);
    expect(box.y + box.height).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it("makes a default-size shape for a click, inside the screenshot", () => {
    const box = clickBox({ x: 0.99, y: 0.01 }, "rect", aspect);
    expect(box.x + box.width).toBeCloseTo(1);
    expect(box.y).toBe(0);
    const circle = clickBox({ x: 0.5, y: 0.25 }, "circle", aspect);
    expect(circle.width).toBe(circle.height);
  });

  it("keeps a moved or resized box on the screenshot", () => {
    expect(
      fitBox({ x: 0.9, y: -0.1, width: 0.3, height: 0.2 }, aspect),
    ).toEqual({ x: 0.7, y: 0, width: 0.3, height: 0.2 });
    const circle = fitBox(
      { x: 0, y: 0, width: 0.8, height: 0.3 },
      aspect,
      true,
    );
    expect(circle.width).toBe(circle.height);
  });
});

describe("annotation area", () => {
  it("covers the whole canvas, measured from the screenshot", () => {
    // A 400-wide screenshot at (72, 50) on a 544 x 400 canvas.
    const area = canvasArea(
      { width: 544, height: 400 },
      { x: 72, y: 50, width: 400, height: 300 },
    );
    expect(area).toEqual({ x: -0.18, y: -0.125, width: 1.36, height: 1 });
    // A shape on the background, left of the screenshot, stays there.
    expect(fitBox({ x: -0.15, y: 0.1, width: 0.1, height: 0.1 }, area)).toEqual(
      { x: -0.15, y: 0.1, width: 0.1, height: 0.1 },
    );
    expect(clickBox({ x: -0.2, y: -0.2 }, "rect", area)).toMatchObject({
      x: -0.18,
      y: -0.125,
    });
  });
});

describe("arrows", () => {
  const area = imageArea(0.5);

  it("point at a click from above left, or from where there is room", () => {
    expect(clickArrow({ x: 0.5, y: 0.25 }, area)).toEqual({
      start: { x: 0.4, y: 0.18 },
      end: { x: 0.5, y: 0.25 },
    });
    // In the top-left corner, the arrow comes from below right instead.
    const corner = clickArrow({ x: 0, y: 0 }, area);
    expect(corner.end).toEqual({ x: 0, y: 0 });
    expect(corner.start.x).toBeCloseTo(0.1);
    expect(corner.start.y).toBeCloseTo(0.07);
  });

  it("move only as far as keeps both ends in the area", () => {
    // Tail at the left edge, pointing up and right.
    expect(fitArrow({ x: -1, y: 0.1 }, { x: 0.3, y: -0.2 }, area)).toEqual({
      x: 0,
      y: 0.2,
    });
    expect(fitArrow({ x: 2, y: 2 }, { x: 0.3, y: 0.2 }, area)).toEqual({
      x: 0.7,
      y: 0.3,
    });
  });

  it("are saved with the design", () => {
    const design = {
      ...createDefaultDesign(),
      annotations: [
        {
          id: "a1",
          kind: "arrow",
          x: 0.1,
          y: 0.1,
          dx: 0.3,
          dy: -0.05,
          color: "#d10373",
        },
      ],
    };
    expect(designSchema.safeParse(design).success).toBe(true);
  });
});

describe("saved designs", () => {
  it("get no annotations and step 1 when saved before annotations", () => {
    const old: Record<string, unknown> = { ...createDefaultDesign() };
    delete old.annotations;
    delete old.nextStep;
    const migrated = migrateDesign(old);
    expect(migrated?.annotations).toEqual([]);
    expect(migrated?.nextStep).toBe(1);
  });
});

describe("snapEnd", () => {
  const area = { x: 0, y: 0, width: 1, height: 0.75 };
  it("keeps a line to 45 degree steps, as far as the pointer reaches", () => {
    expect(snapEnd({ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.53 }, area)).toEqual({
      x: 0.8,
      y: 0.5,
    });
    expect(snapEnd({ x: 0.5, y: 0.5 }, { x: 0.52, y: 0.2 }, area)).toEqual({
      x: 0.5,
      y: 0.2,
    });
    const diagonal = snapEnd({ x: 0.1, y: 0.1 }, { x: 0.32, y: 0.28 }, area);
    expect(diagonal.x - 0.1).toBeCloseTo(diagonal.y - 0.1);
    expect(diagonal.x).toBeCloseTo(0.3);
  });
  it("stops at the edge of the area, keeping the angle", () => {
    const end = snapEnd({ x: 0.5, y: 0.5 }, { x: 1.4, y: 1.3 }, area);
    expect(end.y).toBeCloseTo(0.75);
    expect(end.x).toBeCloseTo(0.75);
  });
});
