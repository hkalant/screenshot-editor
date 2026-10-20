"use client";

import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  /** Current on-screen zoom, 1 being the design's true size. */
  zoom: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  /** False while the zoom is already the default fit. */
  canReset: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
};

export function ZoomControls({
  zoom,
  canZoomIn,
  canZoomOut,
  canReset,
  onZoomIn,
  onZoomOut,
  onReset,
}: Props) {
  return (
    <div
      role="toolbar"
      aria-label="Zoom"
      className="flex items-center gap-0.5 rounded-lg pane-float p-0.5"
    >
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label="Zoom out"
        title="Zoom out"
        disabled={!canZoomOut}
        onClick={onZoomOut}
      >
        <ZoomOut aria-hidden />
      </Button>
      <output
        className="w-12 text-center text-xs font-medium tabular-nums"
        aria-live="polite"
        aria-label="Zoom level"
        data-testid="zoom-level"
      >
        {Math.round(zoom * 100)}%
      </output>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label="Zoom in"
        title="Zoom in"
        disabled={!canZoomIn}
        onClick={onZoomIn}
      >
        <ZoomIn aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label="Reset zoom"
        title="Reset zoom"
        disabled={!canReset}
        onClick={onReset}
      >
        <RotateCcw aria-hidden />
      </Button>
    </div>
  );
}
