"use client";

import { LoaderCircle } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { computePreviewScale } from "@/lib/design/layout";
import { atZoomLimit, maxZoom, minZoom, stepZoom } from "@/lib/design/zoom";
import { useElementSize } from "@/lib/hooks/useElementSize";
import { CANVAS_FOCUS_ATTRIBUTE } from "@/lib/hooks/useShortcuts";
import { selectActiveImage, useEditorStore } from "@/lib/store/editor";
import { useDesignLayout } from "@/lib/store/hooks";
import { cn } from "@/lib/utils";
import { setZoomHandler, type ZoomCommand } from "@/lib/zoomCommands";
import { EmptyState } from "../EmptyState";
import { AnnotationToolbar } from "./AnnotationToolbar";
import { DesignStage } from "./DesignStage";
import { ZoomControls } from "./ZoomControls";

// Room kept free at the top of the workspace for the annotation toolbar.
const TOOLBAR_SPACE = 52;
// Room kept free at the bottom of the workspace for the zoom controls.
const CONTROLS_SPACE = 44;
// Below this workspace height the zoom controls would cover the canvas.
const CONTROLS_MIN_HEIGHT = 120;

type Props = {
  onUpload: () => void;
  onSample: () => void;
};

export function CanvasViewport({ onUpload, onSample }: Props) {
  const image = useEditorStore(selectActiveImage);
  const layout = useDesignLayout();
  const revision = useEditorStore((state) => state.revision);
  const loading = useEditorStore((state) => state.loading);
  const restoring = useEditorStore((state) => state.restoring);
  const transparent = useEditorStore(
    (state) => state.design.background.kind === "transparent",
  );
  const pruneImages = useEditorStore((state) => state.pruneImages);
  // An absolutely positioned box: its size never depends on the stage inside it.
  const [measureRef, size] = useElementSize<HTMLDivElement>();
  const scrollRef = useRef<HTMLDivElement>(null);
  // The zoom the user picked, or null to fit the workspace. A new screenshot
  // starts fitted again.
  const [zoom, setZoom] = useState<number | null>(null);
  const [zoomImageId, setZoomImageId] = useState(image?.id);
  if (zoomImageId !== image?.id) {
    setZoomImageId(image?.id);
    setZoom(null);
  }
  // The point of the design at the middle of the workspace, as fractions of
  // the scrolled content, kept there when the zoom changes.
  const zoomAnchor = useRef<{ x: number; y: number } | null>(null);

  // Free images nothing refers to any more, once the new design is on screen.
  useEffect(() => {
    pruneImages();
  }, [revision, pruneImages]);

  const showControls = size.height >= CONTROLS_MIN_HEIGHT;
  const bottomSpace = showControls ? CONTROLS_SPACE : 0;
  const margin = size.width < 480 ? 16 : 32;
  const fit = layout
    ? computePreviewScale(
        {
          width: size.width,
          height: size.height - bottomSpace - TOOLBAR_SPACE,
        },
        layout.canvas,
        margin,
      )
    : 1;
  const limits = {
    min: minZoom(fit),
    max: layout ? Math.max(fit, maxZoom(layout.canvas)) : 1,
  };
  const scale =
    zoom === null ? fit : Math.min(limits.max, Math.max(limits.min, zoom));

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const anchor = zoomAnchor.current;
    zoomAnchor.current = null;
    if (!scroller || !anchor) return;
    scroller.scrollLeft =
      anchor.x * scroller.scrollWidth - scroller.clientWidth / 2;
    scroller.scrollTop =
      anchor.y * scroller.scrollHeight - scroller.clientHeight / 2;
  }, [scale]);

  const changeZoom = (next: number | null) => {
    const scroller = scrollRef.current;
    if (scroller)
      zoomAnchor.current = {
        x:
          (scroller.scrollLeft + scroller.clientWidth / 2) /
          scroller.scrollWidth,
        y:
          (scroller.scrollTop + scroller.clientHeight / 2) /
          scroller.scrollHeight,
      };
    setZoom(next);
  };

  // The zoom shortcuts work like the buttons, while there is a design.
  const onZoomKey = useEffectEvent((command: ZoomCommand) => {
    if (command === "reset") changeZoom(null);
    else changeZoom(stepZoom(scale, command, limits));
  });
  const hasDesign = Boolean(image && layout);
  useEffect(() => {
    if (hasDesign) return setZoomHandler(onZoomKey);
  }, [hasDesign]);

  if (!image || !layout) {
    return (
      <div ref={measureRef} className="absolute inset-0 overflow-auto">
        <EmptyState
          loading={loading}
          restoring={restoring}
          onUpload={onUpload}
          onSample={onSample}
        />
      </div>
    );
  }

  return (
    <div ref={measureRef} className="absolute inset-0 overflow-hidden">
      {size.width > 0 && (
        // Scrolls when zoomed in past the workspace.
        <div
          ref={scrollRef}
          className="absolute inset-x-0 overflow-auto"
          style={{ top: TOOLBAR_SPACE, bottom: bottomSpace }}
          data-testid="canvas-scroller"
        >
          <div
            className="flex min-h-full w-max min-w-full"
            style={{ padding: margin }}
          >
            <div
              {...{ [CANVAS_FOCUS_ATTRIBUTE]: "" }}
              tabIndex={0}
              // Safari shows the focus ring when the canvas is clicked, as
              // if from the keyboard; only show it after a key press.
              onPointerDownCapture={(event) =>
                event.currentTarget.setAttribute("data-pointer", "")
              }
              onKeyDownCapture={(event) =>
                event.currentTarget.removeAttribute("data-pointer")
              }
              onBlur={(event) => {
                if (event.target === event.currentTarget)
                  event.currentTarget.removeAttribute("data-pointer");
              }}
              aria-label={
                layout.draggable
                  ? "Design canvas. Drag the screenshot or use the arrow keys to move it."
                  : "Design canvas"
              }
              className={cn(
                // Auto margins centre it, and unlike centring with flex they
                // keep all of it reachable by scrolling when it is bigger.
                "m-auto rounded-[2px] shadow-(--sheet-shadow) outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid data-pointer:focus-visible:outline-none",
                transparent && "checkerboard",
              )}
            >
              <DesignStage image={image} layout={layout} scale={scale} />
            </div>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center px-3 pt-2 *:pointer-events-auto">
        <AnnotationToolbar />
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 px-3 pb-2">
        {showControls && (
          <ZoomControls
            zoom={scale}
            canZoomIn={!atZoomLimit(scale, limits.max) && scale < limits.max}
            canZoomOut={!atZoomLimit(scale, limits.min) && scale > limits.min}
            canReset={zoom !== null}
            onZoomIn={() => changeZoom(stepZoom(scale, "in", limits))}
            onZoomOut={() => changeZoom(stepZoom(scale, "out", limits))}
            onReset={() => changeZoom(null)}
          />
        )}
      </div>
      {loading && (
        <div className="absolute top-3 right-3 flex items-center gap-2 rounded-full glass px-3 py-1.5 text-xs">
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          Loading image…
        </div>
      )}
    </div>
  );
}
