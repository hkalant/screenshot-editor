// The shortcuts list lives in the top bar's menu; the keyboard shortcut
// reaches it through the handler the menu registers here while it is shown.

let handler: (() => void) | null = null;

/** Registers what ⌘/Ctrl + / does. Returns a function that removes it. */
export function setShortcutsHandler(next: () => void) {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

/** Shows the shortcuts list; false when no menu is on screen to show it. */
export function runShowShortcuts(): boolean {
  if (!handler) return false;
  handler();
  return true;
}
