"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { canCaptureScreen } from "@/lib/image/capture";
import { ingestScreenCapture } from "@/lib/image/ingest";
import { useEditorStore } from "@/lib/store/editor";

const subscribe = () => () => {};

const PINK = "bg-(--obu-pink) text-white hover:bg-(--obu-pink)/85";

/** Lucide's camera, filled, with the lens cut out to show the button. */
function CameraFilled() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4zM12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7"
      />
    </svg>
  );
}

/**
 * Takes a screenshot of a tab, window or screen through the browser's picker
 * and opens it as the screenshot. Hidden where browsers can't capture the
 * screen (phones). `compact` sizes it for the phone bar. A new screenshot
 * clears the annotations (a second screenshot is one), so with any on the
 * design it asks first.
 */
export function CaptureButton({ compact = false }: { compact?: boolean }) {
  const busy = useEditorStore((state) => state.loading || state.restoring);
  const supported = useSyncExternalStore(
    subscribe,
    canCaptureScreen,
    () => false,
  );
  const [capturing, setCapturing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const annotated = useEditorStore(
    (state) => state.design.annotations.length > 0,
  );
  const hasSecond = useEditorStore((state) =>
    state.design.annotations.some(
      (annotation) => annotation.kind === "screenshot",
    ),
  );

  const capture = async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      // Straight from the click: the picker needs the gesture.
      await ingestScreenCapture();
    } finally {
      setCapturing(false);
    }
  };

  if (!supported) return null;
  return (
    <Popover open={confirming} onOpenChange={setConfirming}>
      <PopoverTrigger asChild>
        <Button
          size={compact ? "icon" : "bar"}
          onClick={(event) => {
            if (annotated) return; // the popover asks first
            event.preventDefault();
            void capture();
          }}
          disabled={busy || capturing}
          className={PINK}
          aria-label="Capture screen"
          data-tip="Take screenshot"
        >
          <CameraFilled />
          {/* The icon alone where the bar is narrow, as for Copy image. */}
          {!compact && (
            <span className="hidden @min-[52rem]/bar:inline">
              Capture screen
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="space-y-3"
        aria-labelledby="capture-confirm-title"
      >
        <p id="capture-confirm-title" className="text-sm font-semibold">
          Replace the screenshot?
        </p>
        <p className="text-sm text-muted-foreground">
          {hasSecond
            ? "A new capture also clears the second screenshot and all annotations."
            : "A new capture also clears all annotations."}{" "}
          Undo brings them back.
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className={PINK}
            onClick={() => {
              setConfirming(false);
              // Straight from this click: the picker needs the gesture.
              void capture();
            }}
          >
            <CameraFilled />
            Capture screen
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
