"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { IMAGE_MESSAGES } from "@/lib/image/accept";
import {
  CaptureCancelled,
  canCaptureScreen,
  captureScreenFrame,
} from "@/lib/image/capture";
import { ingestFile } from "@/lib/image/ingest";
import { useEditorStore } from "@/lib/store/editor";
import { cn } from "@/lib/utils";
import { ToolbarTooltip } from "../canvas/ToolbarTooltip";

const subscribe = () => () => {};

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
 * screen (phones). `compact` sizes it for the phone bar.
 */
export function CaptureButton({ compact = false }: { compact?: boolean }) {
  const busy = useEditorStore((state) => state.loading || state.restoring);
  const supported = useSyncExternalStore(
    subscribe,
    canCaptureScreen,
    () => false,
  );
  const [capturing, setCapturing] = useState(false);
  const wrapper = useRef<HTMLSpanElement>(null);

  const capture = async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      // Straight from the click: the picker needs the gesture.
      const file = await captureScreenFrame();
      await ingestFile(file);
    } catch (error) {
      if (!(error instanceof CaptureCancelled))
        useEditorStore.getState().showError(IMAGE_MESSAGES.captureFailed);
    } finally {
      setCapturing(false);
    }
  };

  if (!supported) return null;
  return (
    // The annotation toolbar's tooltip, which shows sooner than the browser's.
    <span ref={wrapper} className="contents">
      <Button
        size={compact ? "icon" : "bar-icon"}
        onClick={() => void capture()}
        disabled={busy || capturing}
        className={cn(
          "bg-(--obu-pink) text-white hover:bg-(--obu-pink)/85",
          // As tall as Copy image beside it.
          !compact && "size-7.5",
        )}
        aria-label="Take screenshot"
        data-tip="Take screenshot"
      >
        <CameraFilled />
      </Button>
      <ToolbarTooltip toolbar={wrapper} />
    </span>
  );
}
