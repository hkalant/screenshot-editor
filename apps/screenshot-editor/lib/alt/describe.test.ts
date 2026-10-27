import { describe, expect, it } from "vitest";
import type { Annotation, ShapeAnnotation } from "@/lib/design/schema";
import {
  describeAnnotations,
  type FoundLine,
  type FrameText,
  frameSubject,
} from "./describe";

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

const PHONE = { frame: { kind: "phone", title: "", url: "" } } as const;
const frame = (kind: FrameText["kind"], title = "", url = "") => ({
  frame: { kind, title, url },
});

describe("frameSubject", () => {
  it("names the site from a browser's address", () => {
    expect(
      frameSubject(
        frame("browser", "", "https://www.moodle.ac.uk/course?id=4").frame,
      ),
    ).toBe("a page at moodle.ac.uk");
    expect(
      frameSubject(frame("windows-browser", "", "intranet/home").frame),
    ).toBe("a page at intranet");
    expect(frameSubject(frame("browser", "Week 1").frame)).toBeNull();
  });

  it("names a window by its title", () => {
    expect(frameSubject(frame("macos", " Mail ").frame)).toBe(
      "the ‘Mail’ window",
    );
    expect(frameSubject(frame("windows", "").frame)).toBeNull();
    expect(frameSubject(frame("none", "Mail", "a.com").frame)).toBeNull();
  });
});

describe("describeAnnotations", () => {
  it("is empty without annotations or text", () => {
    expect(describeAnnotations([], ASPECT, [])).toBe("");
  });

  it("opens with a title set clearly larger, then the annotations", () => {
    const heading: FoundLine = {
      words: [
        { text: "Course", box: { x: 0.3, y: 0.15, width: 0.12, height: 0.04 } },
        {
          text: "settings",
          box: { x: 0.43, y: 0.15, width: 0.16, height: 0.04 },
        },
      ],
      box: { x: 0.3, y: 0.15, width: 0.29, height: 0.04 },
    };
    expect(describeAnnotations([], ASPECT, [...LINES, heading])).toBe(
      "A screen titled ‘Course settings’.",
    );
    expect(describeAnnotations([], ASPECT, [...LINES, heading], PHONE)).toBe(
      "On a phone: a screen titled ‘Course settings’.",
    );
    // Annotations follow the title rather than replace it.
    expect(
      describeAnnotations([step(1, 0.07, 0.06)], ASPECT, [...LINES, heading]),
    ).toBe("A screen titled ‘Course settings’. Step 1 marks ‘Assessment’.");
  });

  it("guesses no title when nothing stands out", () => {
    // Text all much the same size, as on most app screens.
    expect(describeAnnotations([], ASPECT, LINES)).toBe("");
    // One large word is a label or a button more often than a heading.
    const word: FoundLine = {
      words: [
        {
          text: "Assessment",
          box: { x: 0.3, y: 0.1, width: 0.3, height: 0.06 },
        },
      ],
      box: { x: 0.3, y: 0.1, width: 0.3, height: 0.06 },
    };
    expect(describeAnnotations([], ASPECT, [...LINES, word])).toBe("");
    // A box that OCR ran tall (into a border) is sized by its letters.
    const tall: FoundLine = {
      words: [
        { text: "Week", box: { x: 0.3, y: 0.1, width: 0.04, height: 0.1 } },
        { text: "three", box: { x: 0.35, y: 0.1, width: 0.05, height: 0.1 } },
      ],
      box: { x: 0.3, y: 0.1, width: 0.1, height: 0.1 },
    };
    expect(describeAnnotations([], ASPECT, [...LINES, tall])).toBe("");
  });

  it("never quotes text under a solid box or circle", () => {
    const cover = (shape: "rect" | "rounded" | "circle"): ShapeAnnotation => ({
      id: shape,
      kind: "shape",
      shape,
      x: 0.55,
      y: 0.28,
      width: 0.25,
      height: 0.06,
      color: "#424a52",
      filled: true,
    });
    const arrow: Annotation = {
      id: "a",
      kind: "arrow",
      x: 0.2,
      y: 0.45,
      dx: 0.4,
      dy: -0.14,
      color: "#424a52",
      style: "solid",
      bend: 0,
    };
    for (const shape of ["rect", "rounded", "circle"] as const) {
      const text = describeAnnotations(
        [cover(shape), arrow, step(1, 0.58, 0.29)],
        ASPECT,
        LINES,
      );
      expect(text).not.toMatch(/Student|number|12345/);
      expect(text).toContain("covers an area");
    }
    // Hidden text is no title either.
    expect(
      describeAnnotations(
        [{ ...cover("rect"), x: 0.05, y: 0.02, width: 0.3, height: 0.08 }],
        ASPECT,
        LINES,
      ),
    ).not.toContain("Assessment");
  });

  it("still quotes text under an outlined box", () => {
    expect(
      describeAnnotations(
        [
          {
            id: "b",
            kind: "shape",
            shape: "rect",
            x: 0.55,
            y: 0.28,
            width: 0.25,
            height: 0.06,
            color: "#424a52",
            filled: false,
          },
        ],
        ASPECT,
        LINES,
      ),
    ).toBe("A charcoal box surrounds ‘Student number 12345’.");
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

  it("says where a second screenshot is, and quotes nothing under it", () => {
    const text = describeAnnotations(
      [
        {
          id: "s",
          kind: "screenshot",
          imageId: "b",
          x: 0.55,
          y: 0.25,
          width: 0.4,
          height: 0.2,
          crop: null,
          frame: "none",
          title: "",
          url: "",
        },
        step(1, 0.75, 0.27),
      ],
      ASPECT,
      LINES,
    );
    expect(text).toBe(
      "Step 1 is on the right. A second screenshot is shown at the bottom right.",
    );
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
      describeAnnotations([step(1, 0.07, 0.06)], ASPECT, LINES, PHONE),
    ).toBe("On a phone: step 1 marks ‘Assessment’.");
    expect(
      describeAnnotations([], ASPECT, [], {
        frame: { kind: "laptop", title: "", url: "" },
      }),
    ).toBe("Shown on a laptop.");
    // Window frames go unsaid: no device.
    expect(describeAnnotations([step(1, 0.07, 0.06)], ASPECT, LINES)).toBe(
      "Step 1 marks ‘Assessment’.",
    );
  });

  it("opens with what the frame says the screenshot is", () => {
    const step1 = [step(1, 0.07, 0.06)];
    expect(
      describeAnnotations(
        step1,
        ASPECT,
        LINES,
        frame("browser", "", "moodle.ac.uk"),
      ),
    ).toBe("A page at moodle.ac.uk. Step 1 marks ‘Assessment’.");
    expect(describeAnnotations([], ASPECT, [], frame("macos", "Mail"))).toBe(
      "The ‘Mail’ window.",
    );
  });

  it("adds the title found in the screenshot, once", () => {
    const heading: FoundLine = {
      words: [
        { text: "Course", box: { x: 0.3, y: 0.15, width: 0.12, height: 0.04 } },
        {
          text: "settings",
          box: { x: 0.43, y: 0.15, width: 0.16, height: 0.04 },
        },
      ],
      box: { x: 0.3, y: 0.15, width: 0.29, height: 0.04 },
    };
    const lines = [...LINES, heading];
    expect(
      describeAnnotations(
        [],
        ASPECT,
        lines,
        frame("browser", "", "moodle.ac.uk"),
      ),
    ).toBe("A page at moodle.ac.uk, titled ‘Course settings’.");
    // A window already titled the same says it once.
    expect(
      describeAnnotations([], ASPECT, lines, frame("macos", "course settings")),
    ).toBe("The ‘course settings’ window.");
  });

  it("says what people should notice, in the user's words", () => {
    expect(
      describeAnnotations([step(1, 0.07, 0.06)], ASPECT, LINES, {
        purpose: "  where   the marks are ",
      }),
    ).toBe("Where the marks are. Step 1 marks ‘Assessment’.");
    expect(
      describeAnnotations([], ASPECT, [], {
        ...frame("browser", "", "moodle.ac.uk"),
        purpose: "Submit is at the bottom!",
      }),
    ).toBe("A page at moodle.ac.uk. Submit is at the bottom!");
    expect(describeAnnotations([], ASPECT, [], { purpose: "  " })).toBe("");
  });

  it("names the frame of a second screenshot", () => {
    const text = describeAnnotations(
      [
        {
          id: "s",
          kind: "screenshot",
          imageId: "b",
          x: 0.55,
          y: 0.25,
          width: 0.4,
          height: 0.2,
          crop: null,
          frame: "browser",
          title: "",
          url: "https://example.org/help",
        },
      ],
      ASPECT,
      [],
    );
    expect(text).toBe(
      "A second screenshot, of a page at example.org, is shown at the bottom right.",
    );
  });

  it("says when marked text is in a list or the top bar", () => {
    // A menu down the left, and a bar of links along the top.
    const menu = ["Home", "Contacts", "Assessment", "Grades", "Help"].map(
      (text, index) => line(0.12 + index * 0.04, 0.03, text),
    );
    const bar = ["Courses", "Library", "Profile"].map((text, index) =>
      line(0.02, 0.5 + index * 0.12, text),
    );
    const prose = line(
      0.3,
      0.45,
      "Read",
      "the",
      "notes",
      "below",
      "before",
      "you",
      "start",
    );
    const lines = [...menu, ...bar, prose];
    expect(
      describeAnnotations(
        [step(1, 0.01, 0.2), step(2, 0.62, 0.03), step(3, 0.44, 0.31)],
        ASPECT,
        lines,
      ),
    ).toBe(
      "Step 1 marks ‘Assessment’ in the list on the left. Step 2 marks ‘Library’ in the top bar. Step 3 marks ‘Read the notes below before’.",
    );
  });

  it("falls back to places when the text couldn't be read", () => {
    expect(describeAnnotations([step(1, 0.07, 0.06)], ASPECT, [])).toBe(
      "Step 1 is at the top left.",
    );
  });
});
