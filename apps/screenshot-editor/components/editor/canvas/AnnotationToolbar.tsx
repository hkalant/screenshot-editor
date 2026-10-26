"use client";

import {
  Camera,
  ChevronDown,
  Circle,
  CopyPlus,
  Crop,
  Highlighter,
  ImagePlus,
  MousePointer2,
  MoveUpRight,
  PictureInPicture2,
  RotateCcw,
  ScanSearch,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import {
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  ANNOTATION_COLOR_NAMES,
  ANNOTATION_COLORS,
  MAX_STEP_NUMBER,
  parseStepNumber,
} from "@/lib/design/annotations";
import {
  DEFAULT_MAGNIFY_LENS,
  MAX_MAGNIFY_ZOOM,
  MIN_MAGNIFY_ZOOM,
} from "@/lib/design/magnify";
import {
  LINE_ENDS,
  type MagnifyLens,
  type StepAnnotation,
} from "@/lib/design/schema";
import {
  selectSelectedAnnotation,
  useEditorStore,
  type AnnotationTool,
} from "@/lib/store/editor";
import { pasteAnnotation } from "@/lib/annotationClipboard";
import { ACCEPT_ATTR } from "@/lib/image/accept";
import { canCaptureScreen } from "@/lib/image/capture";
import { ingestFile, ingestScreenCapture } from "@/lib/image/ingest";
import { takeCropPicture } from "@/lib/render/cropPicture";
import { useAnimatedWidth } from "@/lib/hooks/useAnimatedWidth";
import { currentPlatform, isApplePlatform } from "@/lib/platform";
import { ToolOptions } from "./ToolOptions";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";

const buttonClass =
  "flex size-8 shrink-0 items-center justify-center rounded-sm text-foreground outline-none transition-colors hover:bg-accent focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 data-[state=open]:bg-accent aria-pressed:bg-(--tool-active) aria-pressed:shadow-[inset_0_0_0_1px_var(--tool-active-edge)] [&_svg]:size-4";

/** Takes a popover trigger's props too, so it can open a menu. */
function ToolButton({
  label,
  hint,
  pressed,
  ...props
}: {
  label: string;
  /** More in the tooltip than the name. */
  hint?: string;
  pressed?: boolean;
} & ComponentProps<"button">) {
  return (
    <button
      {...props}
      type="button"
      aria-label={label}
      data-tip={hint ? `${label} (${hint})` : label}
      aria-pressed={pressed}
      className={buttonClass}
    />
  );
}

const menuItemClass =
  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors outline-none hover:bg-accent focus-visible:bg-accent aria-checked:font-medium [&_svg]:size-4";

const Divider = () => (
  <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />
);

/** A circle with the number the next step gets. */
function StepIcon({ number }: { number: number }) {
  const text = number > 99 ? "99+" : String(number);
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="7.25" fill="currentColor" />
      <text
        x="8"
        y="8"
        dy="0.36em"
        textAnchor="middle"
        fontSize={text.length > 1 ? 7 : 9}
        fontWeight="700"
        className="fill-background"
      >
        {text}
      </text>
    </svg>
  );
}

/** A rectangle with square corners (lucide's square is rounded). */
function SquareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" />
    </svg>
  );
}

function RoundedIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="4.5" />
    </svg>
  );
}

function FillIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="3"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

/** Starts cropping the selected second screenshot, or else the main one. */
function CropButton() {
  const startCrop = useEditorStore((state) => state.startCrop);
  const selectAnnotation = useEditorStore((state) => state.selectAnnotation);
  const second = useEditorStore((state) => {
    const selected = selectSelectedAnnotation(state);
    return selected?.kind === "screenshot" ? selected.id : null;
  });
  return (
    <ToolButton
      label={second ? "Crop second screenshot" : "Crop screenshot"}
      onClick={() => {
        if (second) {
          startCrop(second);
          return;
        }
        selectAnnotation(null);
        // Once the selection has left the canvas, so it isn't in the picture.
        requestAnimationFrame(() => {
          takeCropPicture();
          startCrop();
        });
      }}
    >
      <Crop aria-hidden />
    </ToolButton>
  );
}

const subscribe = () => () => {};

/**
 * Adds a second screenshot, or replaces the one there is. Where the browser
 * can capture the screen, a menu offers a capture besides a file; elsewhere
 * (phones) the button opens the file picker.
 */
function AddScreenshotButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const capturing = useEditorStore((state) => state.capturing);
  const canCapture = useSyncExternalStore(
    subscribe,
    canCaptureScreen,
    () => false,
  );
  const added = useEditorStore((state) =>
    state.design.annotations.some(
      (annotation) => annotation.kind === "screenshot",
    ),
  );
  const label = added ? "Replace second screenshot" : "Add second screenshot";
  const hint = added
    ? "keeps its place and size"
    : "placed beside the main one";
  const upload = () => inputRef.current?.click();
  return (
    <>
      {canCapture ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <ToolButton
              label={label}
              hint={hint}
              aria-haspopup="menu"
              disabled={capturing}
            >
              <ImagePlus aria-hidden />
            </ToolButton>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            // Icons in line with the button's, as in the shape menu.
            alignOffset={-12}
            className="w-auto p-2.5"
            role="menu"
            aria-label={label}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                upload();
              }}
              className={menuItemClass}
            >
              <Upload aria-hidden />
              {added ? "Upload new screenshot" : "Upload screenshot"}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                // Straight from the click: the picker needs the gesture.
                void ingestScreenCapture("inset");
              }}
              className={menuItemClass}
            >
              <Camera aria-hidden />
              Capture screen
            </button>
          </PopoverContent>
        </Popover>
      ) : (
        <ToolButton label={label} hint={hint} onClick={upload}>
          <ImagePlus aria-hidden />
        </ToolButton>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        tabIndex={-1}
        aria-hidden
        data-testid="second-screenshot-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = ""; // so picking the same file again still fires change
          if (file) void ingestFile(file, "inset");
        }}
      />
    </>
  );
}

/** The selected step's number: digits only. */
function StepNumberField({ step }: { step: StepAnnotation }) {
  const setStepNumber = useEditorStore((state) => state.setStepNumber);
  const sealHistory = useEditorStore((state) => state.sealHistory);
  // What is being typed; otherwise the field shows the step's number.
  const [draft, setDraft] = useState<string | null>(null);
  const [draftFor, setDraftFor] = useState(step.id);
  if (draftFor !== step.id) {
    setDraftFor(step.id);
    setDraft(null);
  }

  return (
    <label className="flex shrink-0 items-center gap-1.5 pl-1 text-xs text-muted-foreground">
      Step
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={String(MAX_STEP_NUMBER).length}
        aria-label="Step number"
        value={draft ?? String(step.number)}
        onChange={(event) => {
          // Numbers only: anything else typed or pasted is dropped.
          const digits = event.target.value.replace(/\D/g, "");
          setDraft(digits);
          const number = parseStepNumber(digits);
          if (number !== null) setStepNumber(step.id, number);
        }}
        onBlur={() => {
          setDraft(null);
          sealHistory();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="h-7 w-11 rounded-sm border border-input bg-background/70 px-2 text-center text-sm text-foreground tabular-nums outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      />
    </label>
  );
}

const STRAIGHT_HINT = "hold Shift for 45° steps";

type ToolItem<T extends AnnotationTool> = {
  tool: T;
  label: string;
  icon: ReactNode;
  hint?: string;
};

/**
 * One button for a group of tools: it uses the last tool picked, and its
 * arrow opens a menu of the others.
 */
function ToolMenu<T extends AnnotationTool>({
  items,
  menuLabel,
  chooseLabel,
}: {
  items: readonly ToolItem<T>[];
  /** What the menu is called, such as "Shapes". */
  menuLabel: string;
  /** What the arrow is called, such as "Choose shape". */
  chooseLabel: string;
}) {
  const tool = useEditorStore((state) => state.annotationTool);
  const setTool = useEditorStore((state) => state.setAnnotationTool);
  const [last, setLast] = useState<T>(items[0].tool);
  const [open, setOpen] = useState(false);
  const active = items.find((item) => item.tool === tool);
  const current =
    active ?? items.find((item) => item.tool === last) ?? items[0];
  const pick = (next: T) => {
    setLast(next);
    setTool(next);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* The menu opens under the tool, not the arrow. */}
      <PopoverAnchor asChild>
        <div className="flex shrink-0 items-center">
          <ToolButton
            label={current.label}
            hint={current.hint}
            pressed={active !== undefined}
            onClick={() => {
              setLast(current.tool);
              setTool(active ? "select" : current.tool);
            }}
          >
            {current.icon}
          </ToolButton>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={chooseLabel}
              data-tip={chooseLabel}
              aria-haspopup="menu"
              className="flex h-8 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid [&_svg]:size-3"
            >
              <ChevronDown aria-hidden />
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        // The menu's icons in line with the tool's: the toolbar icon is 8px
        // into its button, a menu icon 20px into the menu. The 10px padding
        // keeps the rows' 12px corners concentric with the menu's 22px.
        alignOffset={-12}
        className="w-auto p-2.5"
        role="menu"
        aria-label={menuLabel}
      >
        {items.map((item) => (
          <button
            key={item.tool}
            type="button"
            role="menuitemradio"
            aria-checked={item.tool === current.tool}
            onClick={() => pick(item.tool)}
            className={menuItemClass}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

const SHAPES: readonly ToolItem<"rect" | "rounded" | "circle" | "highlight">[] =
  [
    { tool: "rect", label: "Rectangle", icon: <SquareIcon /> },
    { tool: "rounded", label: "Rounded rectangle", icon: <RoundedIcon /> },
    { tool: "circle", label: "Circle", icon: <Circle aria-hidden /> },
    {
      tool: "highlight",
      label: "Highlight",
      icon: <Highlighter aria-hidden />,
    },
  ];

/** Rectangles, circles and highlights, behind one button. */
function ShapeTools() {
  return (
    <ToolMenu items={SHAPES} menuLabel="Shapes" chooseLabel="Choose shape" />
  );
}

/** Arrows and lines, behind one button; the line shows the end new lines get. */
function ArrowTools() {
  const lineEnd = useEditorStore((state) => state.lineEnd);
  const items: readonly ToolItem<"arrow" | "line">[] = [
    {
      tool: "arrow",
      label: "Arrow",
      icon: <MoveUpRight aria-hidden />,
      hint: STRAIGHT_HINT,
    },
    {
      tool: "line",
      label: "Line",
      icon: <LineIcon end={lineEnd} />,
      hint: STRAIGHT_HINT,
    },
  ];
  return (
    <ToolMenu
      items={items}
      menuLabel="Arrows and lines"
      chooseLabel="Choose arrow or line"
    />
  );
}

/** Soft dots fading out: a blur. */
function BlurIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {[4, 9.33, 14.67, 20].flatMap((cx, i) =>
        [4, 9.33, 14.67, 20].map((cy, j) => (
          <circle
            key={`${i}-${j}`}
            cx={cx}
            cy={cy}
            r={2 - Math.abs(i + j - 3) * 0.45}
            opacity={1 - Math.abs(i + j - 3) * 0.22}
          />
        )),
      )}
    </svg>
  );
}

/** How strongly the selected blur box blurs, and new ones after it. */
function BlurStrength() {
  const selected = useEditorStore(selectSelectedAnnotation);
  const intensity = useEditorStore((state) => state.blurIntensity);
  const setBlurIntensity = useEditorStore((state) => state.setBlurIntensity);
  const sealHistory = useEditorStore((state) => state.sealHistory);
  const blur =
    selected?.kind === "shape" && selected.shape === "blur" ? selected : null;
  const value = blur?.intensity ?? intensity;
  return (
    <div className="flex shrink-0 items-center gap-2 px-2 text-xs text-muted-foreground">
      <span aria-hidden>Blur</span>
      <Slider
        className="w-28"
        thumbLabel="Blur strength"
        min={0}
        max={100}
        step={1}
        value={[Math.round(value * 100)]}
        onValueChange={([next]) =>
          setBlurIntensity(blur?.id ?? null, next / 100)
        }
        onValueCommit={() => sealHistory()}
      />
    </div>
  );
}

/** How much the selected magnifier enlarges, and new ones after it. */
function MagnifyZoom() {
  const selected = useEditorStore(selectSelectedAnnotation);
  const zoom = useEditorStore((state) => state.magnifyZoom);
  const setMagnifyZoom = useEditorStore((state) => state.setMagnifyZoom);
  const sealHistory = useEditorStore((state) => state.sealHistory);
  const magnifier =
    selected?.kind === "shape" && selected.shape === "magnify"
      ? selected
      : null;
  const value = magnifier?.zoom ?? zoom;
  return (
    <div className="flex shrink-0 items-center gap-2 px-2 text-xs text-muted-foreground">
      <span aria-hidden>Zoom</span>
      <Slider
        className="w-28"
        thumbLabel="Magnifier zoom"
        min={MIN_MAGNIFY_ZOOM}
        max={MAX_MAGNIFY_ZOOM}
        step={0.25}
        value={[value]}
        onValueChange={([next]) => setMagnifyZoom(magnifier?.id ?? null, next)}
        onValueCommit={() => sealHistory()}
      />
      <span className="w-8 text-foreground tabular-nums">{value}×</span>
    </div>
  );
}

const LENSES: readonly { lens: MagnifyLens; label: string; icon: ReactNode }[] =
  [
    { lens: "circle", label: "Round magnifier", icon: <Circle aria-hidden /> },
    { lens: "rect", label: "Square-cornered magnifier", icon: <SquareIcon /> },
    { lens: "rounded", label: "Rounded magnifier", icon: <RoundedIcon /> },
  ];

/** The selected magnifier's shape and whether it is an inset, or new ones'. */
function MagnifyOptions() {
  const selected = useEditorStore(selectSelectedAnnotation);
  const lens = useEditorStore((state) => state.magnifyLens);
  const inset = useEditorStore((state) => state.magnifyInset);
  const setLens = useEditorStore((state) => state.setMagnifyLens);
  const setInset = useEditorStore((state) => state.setMagnifyInset);
  const magnifier =
    selected?.kind === "shape" && selected.shape === "magnify"
      ? selected
      : null;
  const shown = magnifier ? (magnifier.lens ?? DEFAULT_MAGNIFY_LENS) : lens;
  const isInset = magnifier ? magnifier.from !== undefined : inset;
  return (
    <>
      <ToolButton
        label="Magnify in place"
        hint="Covers the area it enlarges"
        pressed={!isInset}
        onClick={() => setInset(false)}
      >
        <Search aria-hidden />
      </ToolButton>
      <ToolButton
        label="Magnify as an inset"
        hint="Drag over an area: the enlarged copy goes beside it"
        pressed={isInset}
        onClick={() => setInset(true)}
      >
        <PictureInPicture2 aria-hidden />
      </ToolButton>
      <Divider />
      {LENSES.map((item) => (
        <ToolButton
          key={item.lens}
          label={item.label}
          pressed={shown === item.lens}
          onClick={() => setLens(item.lens)}
        >
          {item.icon}
        </ToolButton>
      ))}
    </>
  );
}

/** A line with the chosen end, for the line tool's button. */
function LineIcon({ end }: { end: (typeof LINE_ENDS)[number] }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <line
        x1="4"
        y1="20"
        x2={end === "flat" ? 19 : 18}
        y2={end === "flat" ? 5 : 6}
      />
      {end === "dot" && (
        <circle cx="18" cy="6" r="2.75" fill="currentColor" stroke="none" />
      )}
      {end === "round" && (
        <circle cx="18" cy="6" r="1" fill="currentColor" stroke="none" />
      )}
      {end === "bar" && <line x1="14.5" y1="2.5" x2="21.5" y2="9.5" />}
    </svg>
  );
}

/** Tools for drawing steps, shapes and arrows on the screenshot. */
export function AnnotationToolbar() {
  const tool = useEditorStore((state) => state.annotationTool);
  const color = useEditorStore((state) => state.annotationColor);
  const filled = useEditorStore((state) => state.shapeFilled);
  const nextStep = useEditorStore((state) => state.design.nextStep);
  const selected = useEditorStore(selectSelectedAnnotation);
  const setTool = useEditorStore((state) => state.setAnnotationTool);
  const setColor = useEditorStore((state) => state.setAnnotationColor);
  const setFilled = useEditorStore((state) => state.setShapeFilled);
  const rounded = useEditorStore((state) => state.highlightRounded);
  const setRounded = useEditorStore((state) => state.setHighlightRounded);
  const resetStepCount = useEditorStore((state) => state.resetStepCount);
  const removeAnnotation = useEditorStore((state) => state.removeAnnotation);
  const { boxRef, contentRef } = useAnimatedWidth<
    HTMLDivElement,
    HTMLDivElement
  >();

  // Clicking the active tool again goes back to selecting.
  const toggleTool = (next: AnnotationTool) =>
    setTool(tool === next ? "select" : next);
  const shapeTool = tool === "rect" || tool === "rounded" || tool === "circle";
  // Blur boxes have a strength instead of a colour or a fill.
  const blurMode =
    tool === "blur" ||
    (selected?.kind === "shape" && selected.shape === "blur");
  // Magnifiers have a zoom instead of a colour or a fill.
  const magnifyMode =
    tool === "magnify" ||
    (selected?.kind === "shape" && selected.shape === "magnify");
  // A second screenshot takes its look from the main one: no colour.
  const selectedScreenshot = selected?.kind === "screenshot";
  // Highlights are always a border and a light fill.
  const showCorners =
    tool === "highlight" ||
    (selected?.kind === "shape" && selected.shape === "highlight");
  const showFill =
    !blurMode &&
    !magnifyMode &&
    (shapeTool ||
      (selected?.kind === "shape" && selected.shape !== "highlight"));

  return (
    <div
      ref={boxRef}
      role="toolbar"
      data-tour="annotate"
      aria-label="Annotate"
      // A floating dock over the canvas.
      // Its width follows its tools' options smoothly, growing from the
      // centre because the dock is centred.
      className="max-w-full [scrollbar-width:none] overflow-x-auto overflow-y-hidden rounded-lg pane-float p-1 transition-[width,scale] duration-300 ease-[cubic-bezier(0.3,0.9,0.3,1)] hover:scale-[1.04] has-focus-visible:scale-[1.04] has-aria-expanded:scale-[1.04] motion-reduce:transition-none"
    >
      <div ref={contentRef} className="flex w-max items-center gap-1">
        <ToolButton
          label="Select and move"
          pressed={tool === "select"}
          onClick={() => setTool("select")}
        >
          <MousePointer2 aria-hidden />
        </ToolButton>
        <Divider />
        <button
          type="button"
          aria-label={`Add step ${nextStep}`}
          data-tip={`Add step ${nextStep}`}
          aria-pressed={tool === "step"}
          onClick={() => toggleTool("step")}
          className={cn(buttonClass, "group")}
        >
          <StepIcon number={nextStep} />
        </button>
        <ToolButton
          label="Reset step count"
          disabled={nextStep === 1}
          onClick={resetStepCount}
        >
          <RotateCcw aria-hidden />
        </ToolButton>
        <Divider />
        <ShapeTools />
        <ArrowTools />
        <ToolButton
          label="Blur"
          pressed={tool === "blur"}
          onClick={() => toggleTool("blur")}
        >
          <BlurIcon />
        </ToolButton>
        <ToolButton
          label="Magnifier"
          hint="Drag over an area to show it enlarged"
          pressed={tool === "magnify"}
          onClick={() => toggleTool("magnify")}
        >
          <ScanSearch aria-hidden />
        </ToolButton>
        <Divider />
        <CropButton />
        <AddScreenshotButton />
        <ToolOptions show={showCorners}>
          <Divider />
          <ToolButton
            label="Square corners"
            pressed={!rounded}
            onClick={() => setRounded(false)}
          >
            <SquareIcon />
          </ToolButton>
          <ToolButton
            label="Rounded corners"
            pressed={rounded}
            onClick={() => setRounded(true)}
          >
            <RoundedIcon />
          </ToolButton>
        </ToolOptions>
        <ToolOptions show={showFill}>
          <Divider />
          <ToolButton
            label="Filled shape"
            pressed={filled}
            onClick={() => setFilled(true)}
          >
            <FillIcon filled />
          </ToolButton>
          <ToolButton
            label="Outline shape"
            pressed={!filled}
            onClick={() => setFilled(false)}
          >
            <FillIcon filled={false} />
          </ToolButton>
        </ToolOptions>
        {/* These replace one another, so they swap at once rather than
            fading out, which would show two groups side by side. */}
        {blurMode ? (
          <div
            key="blur"
            className="flex animate-tool-options items-center gap-1"
          >
            <Divider />
            <BlurStrength />
          </div>
        ) : magnifyMode ? (
          <div
            key="magnify"
            className="flex animate-tool-options items-center gap-1"
          >
            <Divider />
            <MagnifyOptions />
            <Divider />
            <MagnifyZoom />
          </div>
        ) : selectedScreenshot ? null : (
          <div
            key="colours"
            className="flex animate-tool-options items-center gap-1"
          >
            <Divider />
            <div
              role="radiogroup"
              aria-label="Annotation colour"
              className="flex items-center gap-1 px-1"
            >
              {ANNOTATION_COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  role="radio"
                  aria-checked={color === swatch}
                  aria-label={ANNOTATION_COLOR_NAMES[swatch]}
                  data-tip={ANNOTATION_COLOR_NAMES[swatch]}
                  onClick={() => setColor(swatch)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-full outline-none focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid"
                >
                  <span
                    className={cn(
                      "size-5 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] transition-shadow dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.4)]",
                      color === swatch &&
                        "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                    )}
                    style={{ backgroundColor: swatch }}
                  />
                </button>
              ))}
            </div>
          </div>
        )}
        <ToolOptions show={!!selected}>
          {selected && (
            <>
              <Divider />
              {selected.kind === "step" && <StepNumberField step={selected} />}
              {/* There's only one second screenshot. */}
              {selected.kind !== "screenshot" && (
                <ToolButton
                  label="Duplicate annotation"
                  hint={`${isApplePlatform(currentPlatform()) ? "⌘" : "Ctrl"}+D`}
                  onClick={() => pasteAnnotation(selected)}
                >
                  <CopyPlus aria-hidden />
                </ToolButton>
              )}
              <ToolButton
                label="Delete annotation"
                onClick={() => removeAnnotation(selected.id)}
              >
                <Trash2 aria-hidden />
              </ToolButton>
            </>
          )}
        </ToolOptions>
      </div>
    </div>
  );
}
