import { describe, expect, it } from "vitest";
import type { Annotation } from "@/lib/design/schema";
import { describeAnnotations, type FoundLine } from "./describe";

// A screenshot 1 wide and 0.5 tall, with two lines of text.
const ASPECT = 0.5;
const line = (y: number, x: number, ...texts: string[]): FoundLine => {
  const words = texts.map((text, index) => ({
    text,
    box: { x: x + index * 0.06, y, width: 0.05, height: 0.02 },
  }));
  return {
    words,
    box: { x, y, width: texts.length * 0.06 - 0.01, height: 0.02 },
  };
};
const LINES = [
  line(0.05, 0.1, "Assessment"),
  line(0.3, 0.6, "Student", "number", "12345"),
];

const step = (number: number, x: number, y: number): Annotation => ({
  id: `s${number}`,
  kind: "step",
  number,
  x,
  y,
  color: "#d10373",
  size: 1,
});

describe("describeAnnotations", () => {
  it("is empty without annotations", () => {
    expect(describeAnnotations([], ASPECT, LINES)).toBe("");
  });

  it("names what each step is next to, in number order", () => {
    const text = describeAnnotations(
      [step(2, 0.95, 0.45), step(1, 0.07, 0.06)],
      ASPECT,
      LINES,
    );
    expect(text).toBe(
      "Step 1 marks ‘Assessment’. Step 2 is at the bottom right.",
    );
  });

  it("describes boxes, highlights and arrows by the text they mark", () => {
    const text = describeAnnotations(
      [
        {
          id: "a",
          kind: "arrow",
          x: 0.5,
          y: 0.25,
          dx: -0.3,
          dy: -0.19,
          color: "#424a52",
          style: "solid",
          bend: 0,
        },
        {
          id: "b",
          kind: "shape",
          shape: "rect",
          x: 0.08,
          y: 0.03,
          width: 0.1,
          height: 0.06,
          color: "#d10373",
          filled: false,
        },
        {
          id: "h",
          kind: "shape",
          shape: "highlight",
          x: 0.58,
          y: 0.28,
          width: 0.2,
          height: 0.05,
          color: "#f9c909",
          filled: true,
        },
      ],
      ASPECT,
      LINES,
    );
    expect(text).toBe(
      "A pink box surrounds ‘Assessment’. A charcoal arrow points to ‘Assessment’. ‘Student number 12345’ is highlighted in yellow.",
    );
  });

  it("never quotes text under a blur box", () => {
    const text = describeAnnotations(
      [
        {
          id: "blur",
          kind: "shape",
          shape: "blur",
          x: 0.55,
          y: 0.25,
          width: 0.3,
          height: 0.1,
          color: "#424a52",
          filled: true,
        },
        step(1, 0.75, 0.27),
      ],
      ASPECT,
      LINES,
    );
    expect(text).toBe(
      "Step 1 is on the right. An area on the right is blurred.",
    );
    expect(text).not.toContain("12345");
  });

  it("splits side-by-side columns into separate phrases", () => {
    // One OCR line running across a menu and a heading, far apart.
    const across: FoundLine = {
      words: [
        {
          text: "Contacts",
          box: { x: 0.05, y: 0.2, width: 0.08, height: 0.02 },
        },
        { text: "|", box: { x: 0.14, y: 0.2, width: 0.005, height: 0.02 } },
        { text: "Week", box: { x: 0.5, y: 0.2, width: 0.05, height: 0.02 } },
        { text: "1", box: { x: 0.56, y: 0.2, width: 0.01, height: 0.02 } },
      ],
      box: { x: 0.05, y: 0.2, width: 0.52, height: 0.02 },
    };
    expect(describeAnnotations([step(1, 0.47, 0.21)], ASPECT, [across])).toBe(
      "Step 1 marks ‘Week 1’.",
    );
  });

  it("names a box round several lines by the first one", () => {
    const text = describeAnnotations(
      [
        {
          id: "b",
          kind: "shape",
          shape: "rect",
          x: 0.05,
          y: 0.02,
          width: 0.8,
          height: 0.35,
          color: "#f9c909",
          filled: false,
        },
      ],
      ASPECT,
      LINES,
    );
    expect(text).toBe("A yellow box surrounds the ‘Assessment’ section.");
  });

  it("says which device the screenshot is shown on", () => {
    expect(
      describeAnnotations([step(1, 0.07, 0.06)], ASPECT, LINES, "phone"),
    ).toBe("On a phone: step 1 marks ‘Assessment’.");
    expect(describeAnnotations([], ASPECT, LINES, "laptop")).toBe(
      "Shown on a laptop.",
    );
    // Window frames go unsaid: no device.
    expect(describeAnnotations([step(1, 0.07, 0.06)], ASPECT, LINES)).toBe(
      "Step 1 marks ‘Assessment’.",
    );
  });

  it("falls back to places when the text couldn't be read", () => {
    expect(describeAnnotations([step(1, 0.07, 0.06)], ASPECT, [])).toBe(
      "Step 1 is at the top left.",
    );
  });
});
