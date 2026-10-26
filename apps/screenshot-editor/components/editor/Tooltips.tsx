"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// The editor's tooltips: any element with a `data-tip` shows it on hover or
// keyboard focus. Used instead of `title`, whose tooltips wait a second or
// more, look different in every browser, and don't show while the annotation
// toolbar grows under the pointer.

/** How long the pointer rests on a button before its tooltip shows. */
const DELAY = 300;
/** Kept this far from the window's edges. */
const EDGE = 8;
const GAP = 8;

type Tip = { text: string; x: number; y: number; above: boolean };

function tipFor(button: HTMLElement): Tip {
  const rect = button.getBoundingClientRect();
  const above = rect.bottom + GAP + 32 > window.innerHeight;
  return {
    text: button.dataset.tip ?? "",
    x: rect.left + rect.width / 2,
    y: above ? rect.top - GAP : rect.bottom + GAP,
    above,
  };
}

/** Shows the tooltip of the element under the pointer, or with the keyboard focus. Mounted once. */
export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = document;
    let shown = false;
    const buttonIn = (target: EventTarget | null) =>
      target instanceof Element
        ? target.closest<HTMLElement>("[data-tip]")
        : null;
    const hide = () => {
      window.clearTimeout(timer.current);
      shown = false;
      setTip(null);
    };
    const show = (button: HTMLElement, delay: number) => {
      window.clearTimeout(timer.current);
      // Moving from one button to the next shows the next one at once.
      if (shown || !delay) {
        shown = true;
        setTip(tipFor(button));
        return;
      }
      timer.current = window.setTimeout(() => {
        if (!button.isConnected) return;
        shown = true;
        setTip(tipFor(button));
      }, delay);
    };
    const onOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const button = buttonIn(event.target);
      if (button) show(button, DELAY);
    };
    const onOut = (event: PointerEvent) => {
      const from = buttonIn(event.target);
      const to = buttonIn(event.relatedTarget);
      if (from && from !== to && !to) hide();
    };
    const onFocus = (event: FocusEvent) => {
      const button = buttonIn(event.target);
      // Only for keyboard focus: a click focuses too.
      if (button?.matches(":focus-visible")) show(button, 0);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    root.addEventListener("pointerover", onOver);
    root.addEventListener("pointerout", onOut);
    root.addEventListener("focusin", onFocus);
    root.addEventListener("focusout", hide);
    // A press acts on the button: its name has done its job.
    root.addEventListener("pointerdown", hide);
    root.addEventListener("keydown", onKey);
    // Scroll doesn't bubble: catch any scrolling element's.
    root.addEventListener("scroll", hide, true);
    return () => {
      window.clearTimeout(timer.current);
      root.removeEventListener("pointerover", onOver);
      root.removeEventListener("pointerout", onOut);
      root.removeEventListener("focusin", onFocus);
      root.removeEventListener("focusout", hide);
      root.removeEventListener("pointerdown", hide);
      root.removeEventListener("keydown", onKey);
      root.removeEventListener("scroll", hide, true);
    };
  }, []);

  // Kept inside the window once its width is known.
  useEffect(() => {
    const node = box.current;
    if (!node || !tip) return;
    const half = node.offsetWidth / 2;
    const x = Math.min(
      Math.max(tip.x, EDGE + half),
      window.innerWidth - EDGE - half,
    );
    node.style.left = `${x}px`;
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <span
      ref={box}
      // The elements are named for assistive technology already.
      aria-hidden
      data-testid="tooltip"
      className="pointer-events-none fixed z-50 w-max max-w-64 -translate-x-1/2 rounded-md bg-foreground px-2.5 py-1.5 text-center text-xs font-medium text-background shadow-md"
      style={{
        left: tip.x,
        top: tip.y,
        transform: tip.above ? "translate(-50%, -100%)" : undefined,
      }}
    >
      {tip.text}
    </span>,
    document.body,
  );
}
