// Whether the user is working with the pointer or the keyboard, for focus
// rings the browser's own :focus-visible can't decide (a focusable div, on
// which browsers disagree).

const MODIFIER_KEYS = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "CapsLock",
  "Fn",
]);

type Key = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey">;

/**
 * Whether a key press means the user is moving around with the keyboard.
 * A modifier on its own (Shift held while dragging, ⌘ on the way to ⌘Tab or
 * ⌘⇧4) and a ⌘, Ctrl or Alt shortcut don't, as for :focus-visible.
 */
export function isKeyboardUse({ key, metaKey, ctrlKey, altKey }: Key) {
  return !MODIFIER_KEYS.has(key) && !metaKey && !ctrlKey && !altKey;
}

let pointer = true;
let tracking = false;

/** Starts following the last input; safe to call more than once. */
export function trackInputModality() {
  if (tracking) return;
  tracking = true;
  document.addEventListener("pointerdown", () => (pointer = true), true);
  document.addEventListener(
    "keydown",
    (event) => {
      if (isKeyboardUse(event)) pointer = false;
    },
    true,
  );
}

/** True unless the last input was keyboard use (see isKeyboardUse). */
export const lastInputWasPointer = () => pointer;
