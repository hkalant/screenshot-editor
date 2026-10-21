import { describe, expect, it } from "vitest";
import { savedOpenSections } from "./sidebar";

describe("savedOpenSections", () => {
  it("opens Canvas size and Background when nothing was saved", () => {
    expect(savedOpenSections(null)).toEqual(["size", "background"]);
    expect(savedOpenSections("frame")).toEqual(["size", "background"]);
  });

  it("keeps known sections, in sidebar order", () => {
    expect(savedOpenSections(["border", "nope", "frame"])).toEqual([
      "frame",
      "border",
    ]);
  });

  it("keeps all of them closed when that was saved", () => {
    expect(savedOpenSections([])).toEqual([]);
  });
});
