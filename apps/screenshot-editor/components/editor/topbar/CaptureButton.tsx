"use client";

import { Camera } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
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

const subscribe = () => () => {};

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
      title="Take screenshot"
    >
      <Camera aria-hidden />
    </Button>
  );
}
