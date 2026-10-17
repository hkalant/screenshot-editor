"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

const EXIT_MS = 180;

/**
 * A group of tool options that fades in when shown and, when hidden, stays
 * on screen just long enough to fade out while narrowing to nothing, so the
 * toolbar around it shrinks smoothly instead of jumping.
 */
export function ToolOptions({
  show,
  children,
}: {
  show: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const [wasShown, setWasShown] = useState(show);
  // What it showed last, kept on screen while it fades out.
  const [kept, setKept] = useState(children);
  if (show && kept !== children) setKept(children);

  // Start leaving in render, so the group never drops out for a frame.
  if (show !== wasShown) {
    setWasShown(show);
    setLeaving(!show);
  }

  useLayoutEffect(() => {
    const el = ref.current;
    if (!leaving || !el) return;
    const ms = matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : EXIT_MS;
    el.style.width = `${el.offsetWidth}px`;
    void el.offsetWidth; // commit the start width before transitioning
    el.style.transition = `width ${ms}ms ease-in, opacity ${ms}ms ease-in`;
    el.style.width = "0px";
    el.style.opacity = "0";
    const timer = setTimeout(() => setLeaving(false), ms);
    return () => clearTimeout(timer);
  }, [leaving]);

  if (!show && !leaving) return null;
  return (
    <div
      ref={ref}
      aria-hidden={leaving || undefined}
      inert={leaving || undefined}
      className={
        leaving
          ? "flex shrink-0 items-center gap-1 overflow-hidden"
          : "flex animate-tool-options items-center gap-1"
      }
    >
      {show ? children : kept}
    </div>
  );
}
