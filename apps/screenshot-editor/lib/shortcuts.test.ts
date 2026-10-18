import { describe, expect, it } from "vitest";
import {
  matchShortcut,
  shortcutApplies,
  type KeyInput,
  type ShortcutContext,
} from "./shortcuts";

const key = (value: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  key: value,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe("matchShortcut", () => {
  it("uses ⌘ on Apple platforms and Ctrl elsewhere", () => {
    expect(matchShortcut(key("z", { metaKey: true }), true)).toEqual({
      type: "undo",
    });
    expect(matchShortcut(key("z", { ctrlKey: true }), false)).toEqual({
      type: "undo",
    });
    expect(matchShortcut(key("z", { ctrlKey: true }), true)).toBeNull();
    expect(matchShortcut(key("z", { metaKey: true }), false)).toBeNull();
  });

  it("redoes with Shift+Z everywhere and Ctrl+Y off Apple platforms", () => {
    expect(
      matchShortcut(key("Z", { metaKey: true, shiftKey: true }), true),
    ).toEqual({
      type: "redo",
    });
    expect(matchShortcut(key("y", { ctrlKey: true }), false)).toEqual({
      type: "redo",
    });
    expect(matchShortcut(key("y", { metaKey: true }), true)).toBeNull();
  });

  it("maps export, copy and open", () => {
    const mod = { ctrlKey: true };
    expect(matchShortcut(key("s", mod), false)).toEqual({ type: "export" });
    expect(matchShortcut(key("c", mod), false)).toEqual({ type: "copy" });
    expect(matchShortcut(key("C", { ...mod, shiftKey: true }), false)).toEqual({
      type: "copy",
    });
    expect(matchShortcut(key("o", mod), false)).toEqual({ type: "open" });
    expect(matchShortcut(key("v", mod), false)).toBeNull(); // paste is handled by the paste event
  });

  it("saves and opens projects with Shift added", () => {
    const shifted = { metaKey: true, shiftKey: true };
    expect(matchShortcut(key("S", shifted), true)).toEqual({
      type: "saveProject",
    });
    expect(matchShortcut(key("O", shifted), true)).toEqual({
      type: "openProject",
    });
  });

  it("zooms with ⌘/Ctrl and plus, minus or zero", () => {
    const zoom = (value: string, mods: Partial<KeyInput>, apple: boolean) =>
      matchShortcut(key(value, mods), apple);
    expect(zoom("=", { metaKey: true }, true)).toEqual({
      type: "zoom",
      direction: "in",
    });
    expect(zoom("+", { ctrlKey: true, shiftKey: true }, false)).toEqual({
      type: "zoom",
      direction: "in",
    });
    expect(zoom("-", { ctrlKey: true }, false)).toEqual({
      type: "zoom",
      direction: "out",
    });
    expect(zoom("0", { metaKey: true }, true)).toEqual({
      type: "zoom",
      direction: "reset",
    });
    // Without the modifier, or with the other one, the keys do nothing.
    expect(zoom("=", {}, true)).toBeNull();
    expect(zoom("-", { ctrlKey: true }, true)).toBeNull();
  });

  it("shows the shortcuts list with ⌘/Ctrl and slash", () => {
    expect(matchShortcut(key("/", { metaKey: true }), true)).toEqual({
      type: "shortcuts",
    });
    expect(matchShortcut(key("/", { ctrlKey: true }), false)).toEqual({
      type: "shortcuts",
    });
    expect(matchShortcut(key("/"), false)).toBeNull();
  });

  it("nudges with arrows, 10 px with Shift", () => {
    expect(matchShortcut(key("ArrowLeft"), false)).toEqual({
      type: "nudge",
      dx: -1,
      dy: 0,
    });
    expect(matchShortcut(key("ArrowDown", { shiftKey: true }), false)).toEqual({
      type: "nudge",
      dx: 0,
      dy: 10,
    });
  });

  it("puts tools down with Escape", () => {
    expect(matchShortcut(key("Escape"), true)).toEqual({ type: "escape" });
  });

  it("deletes with Delete or Backspace, and ignores Alt and unknown keys", () => {
    expect(matchShortcut(key("Backspace"), true)).toEqual({ type: "delete" });
    expect(matchShortcut(key("Delete"), false)).toEqual({ type: "delete" });
    expect(
      matchShortcut(key("z", { ctrlKey: true, altKey: true }), false),
    ).toBeNull();
    expect(matchShortcut(key("a"), false)).toBeNull();
    expect(
      matchShortcut(key("ArrowLeft", { ctrlKey: true }), false),
    ).toBeNull();
  });
});

describe("shortcutApplies", () => {
  const context = (patch: Partial<ShortcutContext> = {}): ShortcutContext => ({
    editable: false,
    hasSelection: false,
    focus: "page",
    ...patch,
  });

  it("does nothing while typing", () => {
    expect(shortcutApplies({ type: "undo" }, context({ editable: true }))).toBe(
      false,
    );
  });

  it("leaves ⌘C to selected text", () => {
    expect(shortcutApplies({ type: "copy" }, context())).toBe(true);
    expect(
      shortcutApplies({ type: "copy" }, context({ hasSelection: true })),
    ).toBe(false);
  });

  it("deletes and nudges only on the canvas", () => {
    expect(
      shortcutApplies({ type: "delete" }, context({ focus: "canvas" })),
    ).toBe(true);
    expect(shortcutApplies({ type: "delete" }, context())).toBe(false);
    expect(
      shortcutApplies({ type: "delete" }, context({ focus: "other" })),
    ).toBe(false);
    const nudge = { type: "nudge", dx: 1, dy: 0 } as const;
    expect(shortcutApplies(nudge, context())).toBe(false);
    expect(shortcutApplies(nudge, context({ focus: "canvas" }))).toBe(true);
  });

  it("ignores key events without a key", () => {
    expect(
      matchShortcut(
        { ...key("a"), key: undefined as unknown as string },
        false,
      ),
    ).toBeNull();
  });

  it("undoes from any control", () => {
    expect(shortcutApplies({ type: "undo" }, context({ focus: "other" }))).toBe(
      true,
    );
  });
});
