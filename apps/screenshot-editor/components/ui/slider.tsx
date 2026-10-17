import { Slider as SliderPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A single-thumb slider. `thumbLabel` names the thumb for screen readers.
 *
 * On a touchscreen only the thumb drags (with a finger-sized hit area): a
 * swipe that starts on the track scrolls the page, as on native sliders,
 * instead of jumping the value to the finger.
 *
 * With `onReset`, double-clicking or double-tapping the thumb, or pressing
 * Delete or Backspace on it, calls it (to go back to the default).
 */
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_SLOP = 24;

function Slider({
  className,
  thumbLabel,
  onReset,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  thumbLabel: string;
  onReset?: () => void;
}) {
  // A touch that started off the thumb. The browser still captures it to the
  // slider, and Radix moves the value on every captured move, so its moves
  // and its end are cancelled too (Radix skips cancelled events).
  const ignored = React.useRef<number | null>(null);
  // When and where the last tap on the thumb ended, to spot a double tap:
  // browsers don't reliably send dblclick for touches.
  const lastTap = React.useRef<{ time: number; x: number; y: number } | null>(
    null,
  );
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        "relative flex w-full touch-pan-y items-center py-1 select-none data-[disabled]:opacity-50",
        className,
      )}
      onPointerDown={(event) => {
        const onThumb =
          event.target instanceof Element &&
          event.target.closest("[data-slot=slider-thumb]");
        if (event.pointerType === "touch" && !onThumb) {
          ignored.current = event.pointerId;
          event.preventDefault();
        } else onPointerDown?.(event);
      }}
      onPointerMove={(event) => {
        if (event.pointerId === ignored.current) event.preventDefault();
        else onPointerMove?.(event);
      }}
      onPointerUp={(event) => {
        if (event.pointerId !== ignored.current) {
          onPointerUp?.(event);
          const onThumb =
            event.target instanceof Element &&
            event.target.closest("[data-slot=slider-thumb]");
          if (!onReset || event.pointerType === "mouse" || !onThumb) return;
          const tap = {
            time: event.timeStamp,
            x: event.clientX,
            y: event.clientY,
          };
          const last = lastTap.current;
          const double =
            last &&
            tap.time - last.time < DOUBLE_TAP_MS &&
            Math.hypot(tap.x - last.x, tap.y - last.y) < DOUBLE_TAP_SLOP;
          lastTap.current = double ? null : tap;
          if (double) onReset();
          return;
        }
        ignored.current = null;
        event.preventDefault();
      }}
      onPointerCancel={(event) => {
        if (event.pointerId !== ignored.current)
          return onPointerCancel?.(event);
        ignored.current = null;
        event.preventDefault();
      }}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-border"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute h-full bg-foreground"
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        aria-label={thumbLabel}
        title={onReset ? "Double-click to reset" : undefined}
        aria-keyshortcuts={onReset ? "Delete" : undefined}
        // After the second click's drag, so the reset has the last word.
        onDoubleClick={onReset}
        onKeyDown={(event) => {
          if (!onReset) return;
          if (event.key !== "Delete" && event.key !== "Backspace") return;
          event.preventDefault();
          onReset();
        }}
        className="relative block h-5 w-7 shrink-0 touch-none rounded-full border-2 border-foreground bg-background shadow-[0_2px_6px_rgb(0_0_0/0.2)] transition-[box-shadow] outline-none after:absolute after:-inset-3 after:rounded-full after:content-[''] hover:ring-4 hover:ring-ring/40 focus-visible:ring-4 focus-visible:ring-ring"
      />
    </SliderPrimitive.Root>
  );
}

export { Slider };
