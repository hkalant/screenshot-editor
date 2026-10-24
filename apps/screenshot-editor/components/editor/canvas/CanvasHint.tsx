"use client";

import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { useEditorStore } from "@/lib/store/editor";

// As long as the animate-hint animation.
const SHOW_MS = 4500;

let shownUpTo = 0;

/**
 * A short note over the zoom controls once a second screenshot is added:
 * it's an annotation, so it goes with the main one.
 */
export function CanvasHint() {
  const added = useEditorStore((state) => state.insetHint);
  // The last one whose hint has gone, kept while the canvas is away (as
  // when cropping).
  const [done, setDone] = useState(() => shownUpTo);

  useEffect(() => {
    if (added === 0 || added <= shownUpTo) return;
    const timer = window.setTimeout(() => {
      shownUpTo = added;
      setDone(added);
    }, SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [added]);

  if (added <= done) return null;
  return (
    <p
      key={added}
      role="status"
      data-testid="canvas-hint"
      className="pointer-events-none flex animate-hint items-center gap-2 rounded-md pane-float px-3 py-1.5 text-xs"
    >
      <Info className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      The second screenshot is treated as an annotation
    </p>
  );
}
