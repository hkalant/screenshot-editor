import { describe, expect, it } from "vitest";
import { isKeyboardUse } from "./inputModality";

const press = (
  key: string,
  modifiers: Partial<Record<"metaKey" | "ctrlKey" | "altKey", boolean>> = {},
) =>
  isKeyboardUse({
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    ...modifiers,
  });

describe("isKeyboardUse", () => {
  it("counts the keys that move around or act", () => {
    for (const key of ["Tab", "ArrowRight", "Delete", "Escape", "Enter", " "])
      expect(press(key)).toBe(true);
  });

  it("ignores modifiers on their own", () => {
    for (const key of ["Shift", "Control", "Alt", "Meta", "CapsLock"])
      expect(press(key)).toBe(false);
  });

  it("ignores shortcuts", () => {
    expect(press("z", { metaKey: true })).toBe(false);
    expect(press("v", { ctrlKey: true })).toBe(false);
    expect(press("Tab", { altKey: true })).toBe(false);
  });
});
