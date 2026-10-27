import { describe, expect, it } from "vitest";
import { createDefaultDesign } from "@/lib/design/defaults";
import type { Design } from "@/lib/design/schema";
import { altBasis, isAltCurrent } from "./basis";

const withStep = (design: Design, x: number): Design => ({
  ...design,
  annotations: [
    { id: "s1", kind: "step", number: 1, x, y: 0.1, color: "#d10373", size: 1 },
  ],
});

const withFrame = (design: Design, kind: "phone" | "macos"): Design => ({
  ...design,
  layers: [{ ...design.layers[0], frame: { ...design.layers[0].frame, kind } }],
});

describe("altBasis", () => {
  it("is the same for the same annotations", () => {
    const design = withStep(createDefaultDesign(), 0.2);
    expect(altBasis(design)).toBe(
      altBasis(withStep(createDefaultDesign(), 0.2)),
    );
    expect(altBasis(design)).toMatch(/^[0-9a-f]{8}$/);
    expect(isAltCurrent(design, altBasis(design))).toBe(true);
  });

  it("changes when an annotation or the device does", () => {
    const design = withStep(createDefaultDesign(), 0.2);
    const basis = altBasis(design);
    expect(isAltCurrent(withStep(design, 0.3), basis)).toBe(false);
    expect(isAltCurrent(withFrame(design, "phone"), basis)).toBe(false);
  });

  it("changes when the frame's title or address does", () => {
    const design = withStep(createDefaultDesign(), 0.2);
    const basis = altBasis(design);
    const framed = (
      kind: "macos" | "browser",
      title: string,
      url: string,
    ): Design => ({
      ...design,
      layers: [
        {
          ...design.layers[0],
          frame: { ...design.layers[0].frame, kind, title, url },
        },
      ],
    });
    expect(isAltCurrent(framed("macos", "Mail", ""), basis)).toBe(false);
    expect(isAltCurrent(framed("browser", "", "moodle.ac.uk"), basis)).toBe(
      false,
    );
    // An address the frame doesn't show says nothing.
    expect(isAltCurrent(framed("macos", "", "moodle.ac.uk"), basis)).toBe(true);
  });

  it("ignores what the suggestion doesn't say: window frames, styles", () => {
    const design = withStep(createDefaultDesign(), 0.2);
    const basis = altBasis(design);
    expect(isAltCurrent(withFrame(design, "macos"), basis)).toBe(true);
    expect(
      isAltCurrent(
        { ...design, layers: [{ ...design.layers[0], padding: 10 }] },
        basis,
      ),
    ).toBe(true);
  });
});
