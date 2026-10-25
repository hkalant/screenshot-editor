// The shortcuts the keyboard menu lists. Keep in step with lib/shortcuts.ts.

export type ShortcutEntry = { keys: string[]; action: string };
export type ShortcutGroup = { title: string; items: ShortcutEntry[] };

/** Every shortcut, with ⌘ and ⌥ names on Apple devices and Ctrl elsewhere. */
export function shortcutGroups(apple: boolean): ShortcutGroup[] {
  const mod = apple ? "⌘" : "Ctrl";
  const shift = apple ? "⇧" : "Shift";
  return [
    {
      title: "General",
      items: [
        { keys: [mod, "O"], action: "Open an image" },
        { keys: [mod, "V"], action: "Paste an image" },
        { keys: [mod, "C"], action: "Copy image (with nothing selected)" },
        { keys: [mod, "S"], action: "Export" },
        { keys: [mod, shift, "S"], action: "Save project" },
        { keys: [mod, shift, "O"], action: "Open project" },
        { keys: [mod, "Z"], action: "Undo" },
        apple
          ? { keys: [mod, shift, "Z"], action: "Redo" }
          : { keys: [mod, "Y"], action: "Redo" },
        { keys: [mod, "/"], action: "Show keyboard shortcuts" },
      ],
    },
    {
      title: "Canvas",
      items: [
        { keys: ["Delete"], action: "Delete the selection or screenshot" },
        { keys: ["Esc"], action: "Deselect, then put the tool down" },
        { keys: [mod, "C"], action: "Copy the selection" },
        { keys: [mod, "V"], action: "Paste the copied annotation" },
        { keys: [mod, "D"], action: "Duplicate the selection" },
        { keys: ["←↑↓→"], action: "Move the selection by 1 px" },
        { keys: [shift, "←↑↓→"], action: "Move the selection by 10 px" },
        { keys: [shift, "Drag"], action: "Straight arrows and lines (45°)" },
        {
          keys: [apple ? "⌥" : "Alt", "Drag"],
          action:
            "Move without snapping to other annotations or the main screenshot",
        },
        { keys: [mod, "+"], action: "Zoom in" },
        { keys: [mod, "−"], action: "Zoom out" },
        { keys: [mod, "0"], action: "Reset zoom" },
      ],
    },
  ];
}
