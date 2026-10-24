"use client";

import { Check, RotateCcw, X } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Button } from "@/components/ui/button";
import {
  CORNER_HANDLES,
  CROP_HANDLES,
  croppedSize,
  FULL_CROP,
  largestCrop,
  moveCrop,
  resizeCrop,
  type CropHandle,
} from "@/lib/design/crop";
import { isDeviceKind } from "@/lib/design/devices";
import { FRAME_LABELS } from "@/lib/design/frames";
import { sharesFrame } from "@/lib/design/inset";
import { computePreviewScale } from "@/lib/design/layout";
import type { Crop } from "@/lib/design/schema";
import { isEditableTarget } from "@/lib/dom";
import type { LoadedImage } from "@/lib/image/load";
import { cropPicture } from "@/lib/render/cropPicture";
import { selectOriginalImage, useEditorStore } from "@/lib/store/editor";
import { cn } from "@/lib/utils";

// Room for the crop bar above the image, and around the image.
const BAR_SPACE = 52;
const MARGIN = 32;
// Arrow keys move or resize the crop by this share of the image (more with Shift).
const KEY_STEP = 0.01;
const KEY_STEP_LARGE = 0.1;

const HANDLE_NAMES: Record<CropHandle, string> = {
  nw: "top left corner",
  ne: "top right corner",
  se: "bottom right corner",
  sw: "bottom left corner",
  n: "top edge",
  e: "right edge",
  s: "bottom edge",
  w: "left edge",
};

/** Where a handle sits on the crop box, as fractions of it. */
function handleSpot(handle: CropHandle) {
  return {
    x: handle.includes("w") ? 0 : handle.includes("e") ? 1 : 0.5,
    y: handle.includes("n") ? 0 : handle.includes("s") ? 1 : 0.5,
  };
}

/** Draws `source` into a canvas the size it's shown at, sharp on any screen. */
function useDrawn(
  source: CanvasImageSource | null,
  width: number,
  height: number,
) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !source) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
  }, [source, width, height]);
  return ref;
}

type Drag = {
  pointer: number;
  /** "move", or the handle being dragged. */
  mode: "move" | CropHandle;
  from: Crop;
  start: { x: number; y: number };
};

type Props = {
  /** The workspace's size. */
  width: number;
  height: number;
};

/**
 * Choosing the main screenshot's crop: the whole original, without its
 * frame, with the annotations over it and a box to drag and resize.
 */
export function CropView({ width, height }: Props) {
  const main = useEditorStore(selectOriginalImage);
  const second = useEditorStore((state) => {
    const found = state.design.annotations.find(
      (annotation) => annotation.id === state.cropId,
    );
    return found?.kind === "screenshot" ? found : null;
  });
  const secondImage = useEditorStore((state) =>
    second ? state.images[second.imageId] : undefined,
  );
  const shot = useEditorStore((state) => state.design.layers[0]);
  if (second) {
    if (!secondImage) return null;
    return (
      <CropArea
        image={secondImage}
        crop={second.crop}
        second
        width={width}
        height={height}
      />
    );
  }
  if (!main) return null;
  return (
    <CropArea image={main} crop={shot.crop} width={width} height={height} />
  );
}

function CropArea({
  image,
  crop: start,
  second = false,
  width,
  height,
}: Props & {
  image: LoadedImage;
  /** The crop the screenshot has now. */
  crop: Crop | null;
  /** The second screenshot, not the main one. */
  second?: boolean;
}) {
  const frameKind = useEditorStore(
    (state) => state.design.layers[0].frame.kind,
  );
  const applyCrop = useEditorStore((state) => state.applyCrop);
  const cancelCrop = useEditorStore((state) => state.cancelCrop);
  // A device only fits its own shape, so the crop keeps the shape it has.
  // (The second screenshot is never in one.)
  const device = !second && isDeviceKind(frameKind) ? frameKind : null;
  const current = croppedSize(image, start);
  const ratio = device ? current.width / current.height : null;
  const [crop, setCrop] = useState<Crop>(start ?? FULL_CROP);
  // The annotations are on the main screenshot.
  const [picture] = useState(() => (second ? null : cropPicture()));
  const drag = useRef<Drag | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const scale = computePreviewScale(
    { width, height: height - BAR_SPACE },
    image,
    MARGIN,
  );
  const shown = { width: image.width * scale, height: image.height * scale };
  const imageRef = useDrawn(image.source, shown.width, shown.height);
  // The picture is in image widths of the screenshot as it was cropped.
  const before = start ?? FULL_CROP;
  const unit = before.width * shown.width;
  const pictureBox = picture && {
    left: before.x * shown.width + picture.x * unit,
    top: before.y * shown.height + picture.y * unit,
    width: picture.width * unit,
    height: picture.height * unit,
  };
  const pictureRef = useDrawn(
    picture?.canvas ?? null,
    pictureBox?.width ?? 0,
    pictureBox?.height ?? 0,
  );

  const done = useEffectEvent(() => applyCrop(crop));
  const cancel = useEffectEvent(() => cancelCrop());

  // Enter and Esc wherever the focus is, except in a text field.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      } else if (
        event.key === "Enter" &&
        // Other buttons do what they say; the handles crop.
        !(
          event.target instanceof HTMLButtonElement &&
          !event.target.dataset.handle
        )
      ) {
        event.preventDefault();
        done();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Start on the crop box, for the arrow keys.
  useEffect(() => {
    boxRef.current?.focus({ preventScroll: true });
  }, []);

  /** A pointer's position as fractions of the image. */
  const pointAt = (event: PointerEvent) => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  };

  const startDrag = (event: PointerEvent, mode: Drag["mode"]) => {
    if (event.button !== 0) return;
    const start = pointAt(event);
    if (!start) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointer: event.pointerId, mode, from: crop, start };
  };

  const onPointerMove = (event: PointerEvent) => {
    const active = drag.current;
    if (!active || active.pointer !== event.pointerId) return;
    const point = pointAt(event);
    if (!point) return;
    if (active.mode === "move")
      setCrop(
        moveCrop(
          active.from,
          point.x - active.start.x,
          point.y - active.start.y,
        ),
      );
    else {
      // From where the handle was, by as much as the pointer moved.
      const spot = handleSpot(active.mode);
      setCrop(
        resizeCrop(
          active.from,
          active.mode,
          {
            x:
              active.from.x +
              spot.x * active.from.width +
              point.x -
              active.start.x,
            y:
              active.from.y +
              spot.y * active.from.height +
              point.y -
              active.start.y,
          },
          image,
          ratio,
        ),
      );
    }
  };

  const endDrag = (event: PointerEvent) => {
    if (drag.current?.pointer === event.pointerId) drag.current = null;
  };

  const arrows = (event: KeyboardEvent) => {
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    const delta = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[event.key];
    if (!delta) return null;
    event.preventDefault();
    event.stopPropagation();
    return { x: delta[0], y: delta[1] };
  };

  const onBoxKey = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    const delta = arrows(event);
    if (delta) setCrop(moveCrop(crop, delta.x, delta.y));
  };

  const onHandleKey = (event: KeyboardEvent, handle: CropHandle) => {
    const delta = arrows(event);
    if (!delta) return;
    const spot = handleSpot(handle);
    setCrop(
      resizeCrop(
        crop,
        handle,
        {
          x: crop.x + spot.x * crop.width + delta.x,
          y: crop.y + spot.y * crop.height + delta.y,
        },
        image,
        ratio,
      ),
    );
  };

  const box = {
    left: crop.x * shown.width,
    top: crop.y * shown.height,
    width: crop.width * shown.width,
    height: crop.height * shown.height,
  };
  const pixels = croppedSize(image, crop);
  const handles = ratio ? CORNER_HANDLES : CROP_HANDLES;

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center px-3 pt-2 *:pointer-events-auto">
        <div
          role="toolbar"
          aria-label="Crop"
          className="flex max-w-full [scrollbar-width:none] items-center gap-2 overflow-x-auto rounded-lg pane-float p-1 sm:pl-3"
        >
          <p className="shrink text-xs text-muted-foreground max-sm:hidden">
            {device
              ? `Keeps the ${FRAME_LABELS[device].toLowerCase()} shape, so the frame still fits.`
              : frameKind === "none" || (second && !sharesFrame(frameKind))
                ? `Drag the edges or corners to crop the ${second ? "second " : ""}screenshot.`
                : `Cropping the ${second ? "second " : ""}screenshot. The frame fits around it afterwards.`}
          </p>
          <span
            // Phones keep the room for the buttons.
            className="shrink-0 text-xs font-medium tabular-nums max-sm:sr-only"
            data-testid="crop-size"
          >
            {pixels.width} × {pixels.height}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCrop(largestCrop(image, ratio))}
          >
            <RotateCcw aria-hidden />
            Reset
          </Button>
          <Button variant="ghost" size="sm" onClick={() => cancelCrop()}>
            <X aria-hidden />
            Cancel
          </Button>
          <Button size="sm" onClick={() => applyCrop(crop)}>
            <Check aria-hidden />
            Done
          </Button>
        </div>
      </div>
      <div
        className="absolute inset-x-0 bottom-0 flex items-center justify-center"
        style={{ top: BAR_SPACE }}
      >
        <div
          ref={areaRef}
          data-testid="crop-area"
          className="relative touch-none select-none"
          style={shown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <canvas
            ref={imageRef}
            className="absolute inset-0 size-full"
            aria-hidden
          />
          {pictureBox && (
            <canvas
              ref={pictureRef}
              className="pointer-events-none absolute"
              style={pictureBox}
              aria-hidden
            />
          )}
          {/* Everything outside the crop dimmed. */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="absolute shadow-[0_0_0_9999px_rgb(0_0_0/0.55)]"
              style={box}
            />
          </div>
          <div
            ref={boxRef}
            role="group"
            tabIndex={0}
            aria-label={`Crop area, ${pixels.width} by ${pixels.height} pixels. Drag or use the arrow keys to move it; Enter to crop, Escape to cancel.`}
            data-testid="crop-box"
            className="absolute cursor-move shadow-[0_0_0_1px_rgb(0_0_0/0.45)] outline-1 outline-white outline-solid focus-visible:outline-3 focus-visible:outline-ring"
            style={box}
            onPointerDown={(event) => startDrag(event, "move")}
            onKeyDown={onBoxKey}
          >
            {/* Thirds, to help line things up. */}
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 *:border-white/35">
              {Array.from({ length: 9 }, (_, index) => (
                <div
                  key={index}
                  className={cn(
                    index % 3 !== 2 && "border-r",
                    index < 6 && "border-b",
                  )}
                />
              ))}
            </div>
            {handles.map((handle) => {
              const spot = handleSpot(handle);
              const corner = handle.length === 2;
              return (
                <button
                  key={handle}
                  type="button"
                  aria-label={`Resize from the ${HANDLE_NAMES[handle]}`}
                  data-handle={handle}
                  onPointerDown={(event) => startDrag(event, handle)}
                  onKeyDown={(event) => onHandleKey(event, handle)}
                  // A big target, for fingers too, round a small mark.
                  className={cn(
                    "absolute flex size-8 -translate-1/2 items-center justify-center outline-none focus-visible:*:outline-3 focus-visible:*:outline-ring focus-visible:*:outline-solid",
                    handle === "n" || handle === "s"
                      ? "cursor-ns-resize"
                      : handle === "e" || handle === "w"
                        ? "cursor-ew-resize"
                        : handle === "nw" || handle === "se"
                          ? "cursor-nwse-resize"
                          : "cursor-nesw-resize",
                  )}
                  style={{
                    left: `${spot.x * 100}%`,
                    top: `${spot.y * 100}%`,
                  }}
                >
                  <span
                    className={cn(
                      "block rounded-[2px] border border-black/30 bg-white shadow-sm",
                      corner
                        ? "size-3.5"
                        : handle === "n" || handle === "s"
                          ? "h-1.5 w-5"
                          : "h-5 w-1.5",
                    )}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
