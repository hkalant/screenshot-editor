"use client";

import { Copy } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { COPIED, onCopied, runCopy } from "@/lib/export/controller";
import { canCopyImages } from "@/lib/export/exportImage";
import { selectActiveImage, useEditorStore } from "@/lib/store/editor";

const subscribe = () => () => {};

/** How long the "Copied" tooltip stays up. */
const COPIED_MS = 1800;

/**
 * Copies the design as a PNG. Hidden where browsers can't put images on the
 * clipboard. `compact` shows the icon alone, for the phone bar.
 */
export function CopyButton({ compact = false }: { compact?: boolean }) {
  const image = useEditorStore(selectActiveImage);
  // As for Export: copying waits for the restore (runCopy ignores it until then).
  const busy = useEditorStore((state) => state.loading || state.restoring);
  const exporting = useEditorStore((state) => state.exporting);
  const supported = useSyncExternalStore(subscribe, canCopyImages, () => false);
  // Bumped on each copy, so a repeat copy restarts the tooltip and its animation.
  const [copied, setCopied] = useState(0);

  useEffect(() => onCopied(() => setCopied((count) => count + 1)), []);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(0), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!supported) return null;
  return (
    <div className="relative">
      <Button
        variant="outline"
        size={compact ? "icon" : "bar"}
        // Straight from the click: the clipboard write must start in the gesture.
        onClick={runCopy}
        disabled={!image || busy}
        // Busy but focusable while a copy or export runs (runCopy ignores clicks).
        aria-disabled={exporting || undefined}
        className="aria-disabled:opacity-50"
        aria-label="Copy image"
        data-tip={copied ? undefined : "Copy image"}
      >
        <Copy aria-hidden />
        {!compact && (
          <span className="hidden @min-[52rem]/bar:inline">Copy image</span>
        )}
      </Button>
      <div role="status" className="contents">
        {copied > 0 && (
          <span
            key={copied}
            data-testid="copied-tooltip"
            className="pointer-events-none absolute top-full left-1/2 z-50 mt-2 animate-copied rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-background shadow-md"
          >
            {COPIED}
          </span>
        )}
      </div>
    </div>
  );
}
