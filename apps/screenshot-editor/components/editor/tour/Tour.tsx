"use client";

import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/lib/store/editor";
import { type SidebarSection, useSidebarStore } from "@/lib/store/sidebar";
import { tourSeen, useTourStore } from "@/lib/tour/tour";
import { cn } from "@/lib/utils";
import { TourIllustration } from "./TourIllustration";

type Side = "right" | "bottom" | "top";

type Step = {
  /** A CSS selector for what the step points at; none for a centred card. */
  target?: string;
  side?: Side;
  title: string;
  body: string;
  /** Runs when the step shows. */
  enter?: () => void;
};

const reveal = (section: SidebarSection) =>
  useSidebarStore.getState().reveal(section);

// How long the Frame & Style step waits before opening Frame, so the
// section is seen to open.
const SWITCH_DELAY_MS = 700;
let switchTimer: number | undefined;

const STEPS: Step[] = [
  {
    target: '[data-tour="section-background"]',
    side: "right",
    title: "Background",
    body: "Choose a gradient, a solid colour or upload your own image behind the screenshot, then adjust the angle and blur.",
    enter: () => reveal("background"),
  },
  {
    target: '[data-tour="section-frame"]',
    side: "right",
    title: "Frame & Style",
    body: "Further down the sidebar, add a browser frame and set the padding, shadow and border. Open as many sections as you like.",
    enter: () => {
      window.clearTimeout(switchTimer);
      switchTimer = window.setTimeout(() => reveal("frame"), SWITCH_DELAY_MS);
    },
  },
  {
    target: '[data-tour="annotate"]',
    side: "bottom",
    title: "Annotate",
    body: "Add numbered steps, boxes, arrows and lines. Blur anything private, and magnify the detail that matters.",
  },
  {
    target: '[data-tour="export"]',
    side: "bottom",
    title: "Export",
    body: "Save your screenshot flattened, as a PNG or JPEG at the size you need. The arrow opens the options, including the original screenshot.",
  },
  {
    target: '[data-tour="menu"]',
    side: "bottom",
    title: "Save your work",
    body: "Save your work as a project file to keep every annotation editable, and open it again later. This menu also has the theme, the keyboard shortcuts and this tour.",
  },
  {
    title: "You're all set!",
    body: "The sample screenshot goes away now. Paste, drop or click to open your own screenshot to begin.",
  },
];

/** Keeps Tab cycling through the tour's buttons. */
function trapFocus(event: KeyboardEvent) {
  const buttons = [
    ...document.querySelectorAll<HTMLElement>(
      "[data-tour-dialog] button:not(:disabled)",
    ),
  ];
  if (buttons.length === 0) return;
  const at = buttons.indexOf(document.activeElement as HTMLElement);
  const next = event.shiftKey
    ? at <= 0
      ? buttons.length - 1
      : at - 1
    : (at + 1) % buttons.length;
  buttons[next].focus();
}

const GAP = 12;
const MARGIN = 12;
const CARD_WIDTH = 320;

type Rect = { top: number; left: number; width: number; height: number };

function rectOf(selector: string | undefined): Rect | null {
  if (!selector) return null;
  const element = document.querySelector(selector);
  if (!element) return null;
  const { top, left, width, height } = element.getBoundingClientRect();
  return { top, left, width, height };
}

function sameRect(a: Rect | null, b: Rect | null) {
  return (
    a === b ||
    (!!a &&
      !!b &&
      a.top === b.top &&
      a.left === b.left &&
      a.width === b.width &&
      a.height === b.height)
  );
}

/** Where the card goes beside the target, kept on screen. */
function cardPosition(target: Rect, side: Side, card: DOMRect) {
  const clamp = (value: number, size: number, room: number) =>
    Math.min(Math.max(value, MARGIN), room - size - MARGIN);
  if (side === "right")
    return {
      left: clamp(target.left + target.width + GAP, card.width, innerWidth),
      top: clamp(target.top, card.height, innerHeight),
    };
  const left = clamp(
    target.left + target.width / 2 - card.width / 2,
    card.width,
    innerWidth,
  );
  const below = target.top + target.height + GAP;
  const above = target.top - GAP - card.height;
  // The preferred side, or the other one where it doesn't fit.
  const fitsBelow = below + card.height <= innerHeight - MARGIN;
  const fitsAbove = above >= MARGIN;
  const top =
    side === "bottom"
      ? fitsBelow || !fitsAbove
        ? below
        : above
      : fitsAbove || !fitsBelow
        ? above
        : below;
  return { left, top: clamp(top, card.height, innerHeight) };
}

/** Follows the target's box, which can move (the toolbar resizes, the window too). */
function useTargetRect(selector: string | undefined) {
  const [rect, setRect] = useState<Rect | null>(null);
  useLayoutEffect(() => {
    let frame = 0;
    let last: Rect | null = null;
    const tick = () => {
      const next = rectOf(selector);
      if (!sameRect(last, next)) {
        last = next;
        setRect(next);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [selector]);
  return rect;
}

function Welcome() {
  const start = useTourStore((state) => state.start);
  const end = useTourStore((state) => state.end);
  const starting = useTourStore((state) => state.starting);
  const startRef = useRef<HTMLButtonElement>(null);
  useEffect(() => startRef.current?.focus(), []);

  return (
    <div className="tour-fade fixed inset-0 z-[60] grid place-items-center bg-black/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-description"
        data-testid="tour-welcome"
        data-tour-dialog
        className="tour-pop w-full max-w-md overflow-hidden rounded-xl bg-background text-foreground shadow-2xl"
      >
        <TourIllustration className="block h-auto w-full" />
        <div className="space-y-2 px-6 pt-5">
          <h2 id="tour-title" className="text-xl font-semibold">
            Welcome to Screenshot Editor
          </h2>
          <p id="tour-description" className="text-sm text-muted-foreground">
            Turn any screenshot into a polished image in seconds. Click Start
            below to explore the different options of the editor with a sample
            screenshot before making your own.
          </p>
        </div>
        <div className="flex justify-end gap-2 px-6 pt-5 pb-6">
          <Button variant="ghost" onClick={end} disabled={starting}>
            Skip tour
          </Button>
          <Button
            ref={startRef}
            onClick={() => void start()}
            disabled={starting}
          >
            {starting ? "Loading…" : "Start"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StepCard({ index }: { index: number }) {
  const go = useTourStore((state) => state.go);
  const end = useTourStore((state) => state.end);
  const step = STEPS[index - 1];
  const last = index === STEPS.length;
  const target = useTargetRect(step.target);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    step.enter?.();
    nextRef.current?.focus();
    return () => window.clearTimeout(switchTimer);
  }, [step]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    setPosition(
      target
        ? cardPosition(
            target,
            step.side ?? "bottom",
            card.getBoundingClientRect(),
          )
        : null,
    );
  }, [target, step]);

  const pad = 6;
  return (
    <div className="fixed inset-0 z-[60]" data-testid="tour-step">
      {target ? (
        // The page dimmed around a hole over the target; the layer above
        // catches clicks so the page waits until the tour ends. The dimming
        // stays put between steps (fading it would flash the whole screen);
        // only the outline fades in.
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl"
          style={{
            top: target.top - pad,
            left: target.left - pad,
            width: target.width + pad * 2,
            height: target.height + pad * 2,
            boxShadow: "0 0 0 9999px rgb(0 0 0 / 45%)",
          }}
        >
          <div className="tour-spot absolute inset-0 rounded-xl ring-2 ring-white/80" />
        </div>
      ) : (
        <div aria-hidden className="absolute inset-0 bg-black/45" />
      )}
      <div
        ref={cardRef}
        role="dialog"
        data-tour-dialog
        aria-modal="true"
        aria-labelledby="tour-step-title"
        aria-describedby="tour-step-body"
        className={cn(
          "tour-pop absolute rounded-xl bg-background p-4 text-foreground shadow-2xl",
          !position && "top-1/2 left-1/2 -translate-1/2",
        )}
        style={{
          width: CARD_WIDTH,
          maxWidth: "calc(100vw - 24px)",
          ...position,
        }}
      >
        <div className="flex items-start gap-2">
          <h2 id="tour-step-title" className="flex-1 text-base font-semibold">
            {step.title}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="-mt-1.5 -mr-1.5 size-7"
            aria-label="Close tour"
            title="Close tour"
            onClick={end}
          >
            <X aria-hidden />
          </Button>
        </div>
        <p id="tour-step-body" className="mt-1.5 text-sm text-muted-foreground">
          {step.body}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <span
            className="flex-1 text-xs text-muted-foreground tabular-nums"
            data-testid="tour-count"
          >
            {index} of {STEPS.length}
          </span>
          {index > 1 && (
            <Button variant="ghost" size="sm" onClick={() => go(index - 1)}>
              Back
            </Button>
          )}
          <Button
            ref={nextRef}
            size="sm"
            onClick={() => (last ? end() : go(index + 1))}
          >
            {last ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * The welcome tour, shown once on the first desktop visit (after any
 * autosaved design is back) and again from Menu → Take the tour.
 */
export function Tour({ enabled }: { enabled: boolean }) {
  const step = useTourStore((state) => state.step);
  const open = useTourStore((state) => state.open);
  const restoring = useEditorStore((state) => state.restoring);

  useEffect(() => {
    if (enabled && !restoring && !tourSeen()) open();
  }, [enabled, restoring, open]);

  // Leaving the desktop layout ends it: the steps point at desktop controls.
  // The welcome alone stays open, only not shown, so a window narrowed for
  // a moment still has it when wide again.
  useEffect(() => {
    const { step: current, end } = useTourStore.getState();
    if (!enabled && current !== null && current !== 0) end();
  }, [enabled]);

  // Esc ends it, the arrow keys move between steps, and Tab stays in the
  // tour. Caught first and kept from the editor, whose shortcuts would act
  // on the page underneath.
  useEffect(() => {
    if (step === null || !enabled) return;
    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      const { go, end } = useTourStore.getState();
      if (event.key === "Escape") end();
      else if (step > 0 && event.key === "ArrowRight")
        if (step < STEPS.length) go(step + 1);
        else end();
      else if (step > 1 && event.key === "ArrowLeft") go(step - 1);
      else if (event.key === "Tab") trapFocus(event);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [step, enabled]);

  if (step === null || !enabled) return null;
  return step === 0 ? <Welcome /> : <StepCard key={step} index={step} />;
}
