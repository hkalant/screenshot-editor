// Keyboard shortcuts as pure functions, so they can be tested without a page.
// lib/hooks/useShortcuts.ts connects them to the window.

export type ShortcutCommand =
  | { type: "undo" }
  | { type: "redo" }
  | { type: "export" }
  | { type: "copy" }
  | { type: "open" }
  | { type: "delete" }
  | { type: "escape" }
  | { type: "nudge"; dx: number; dy: number }
  | { type: "zoom"; direction: "in" | "out" | "reset" }
  | { type: "shortcuts" }
  | { type: "saveProject" }
  | { type: "openProject" };

export type KeyInput = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
>;

const ARROWS: Record<string, [number, number]> = {
  arrowleft: [-1, 0],
  arrowright: [1, 0],
  arrowup: [0, -1],
  arrowdown: [0, 1],
};

/** The command a key press asks for. `apple` picks ⌘ over Ctrl as the modifier. */
export function matchShortcut(
  event: KeyInput,
  apple: boolean,
): ShortcutCommand | null {
  if (event.altKey) return null;
  // Some synthetic key events (Chrome's autofill) have no key at all.
  const key = event.key?.toLowerCase() ?? "";
  const modifier = apple ? event.metaKey : event.ctrlKey;
  // The other modifier (Ctrl on a Mac, the Windows key elsewhere) means
  // something else; leave those presses to the system.
  const otherModifier = apple ? event.ctrlKey : event.metaKey;

  if (modifier && !otherModifier) {
    if (key === "z") return { type: event.shiftKey ? "redo" : "undo" };
    if (key === "y" && !apple && !event.shiftKey) return { type: "redo" };
    if (key === "s") return { type: event.shiftKey ? "saveProject" : "export" };
    if (key === "c") return { type: "copy" };
    if (key === "o") return { type: event.shiftKey ? "openProject" : "open" };
    // "=" is the plus key without Shift; "+" with it, or on the number pad.
    if (key === "=" || key === "+") return { type: "zoom", direction: "in" };
    if (key === "-" || key === "_") return { type: "zoom", direction: "out" };
    if (key === "0" && !event.shiftKey)
      return { type: "zoom", direction: "reset" };
    if (key === "/" && !event.shiftKey) return { type: "shortcuts" };
    return null;
  }
  if (event.metaKey || event.ctrlKey) return null;

  if (key === "delete" || key === "backspace") return { type: "delete" };
  if (key === "escape" && !event.shiftKey) return { type: "escape" };
  const arrow = ARROWS[key];
  if (arrow) {
    const step = event.shiftKey ? 10 : 1;
    return { type: "nudge", dx: arrow[0] * step, dy: arrow[1] * step };
  }
  return null;
}

export type ShortcutContext = {
  /** Focus is in a text field or other editable element. */
  editable: boolean;
  /** Some page text is selected (then ⌘C copies that text). */
  hasSelection: boolean;
  /** What has focus: the design canvas, nothing in particular (the page), or a control. */
  focus: "canvas" | "page" | "other";
};

/** Whether the command applies where the key was pressed. */
export function shortcutApplies(
  command: ShortcutCommand,
  context: ShortcutContext,
): boolean {
  if (context.editable) return false;
  switch (command.type) {
    case "copy":
      return !context.hasSelection;
    case "delete":
      // Only on the canvas: focus can fall back to the page from a control
      // (a field that re-renders, a button that turns disabled), and a
      // Backspace meant for that control must not remove the screenshot.
      return context.focus === "canvas";
    case "nudge":
      return context.focus === "canvas";
    default:
      return true;
  }
}
