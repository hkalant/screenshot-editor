import { create } from "zustand";
import {
  canvasArea,
  clampStepSize,
  clampToArea,
  DEFAULT_ANNOTATION_COLOR,
  fitArrow,
  fitBox,
  isAnnotationColor,
  isSquareShape,
  MAX_STEP_NUMBER,
  newAnnotationId,
  roundBox,
  roundPoint,
  type Box,
  type Point,
} from "@/lib/design/annotations";
import { MAX_ARROW_BEND } from "@/lib/design/arrowShape";
import { DEFAULT_BLUR_INTENSITY } from "@/lib/design/blur";
import {
  clampMagnifyZoom,
  DEFAULT_MAGNIFY_LENS,
  DEFAULT_MAGNIFY_ZOOM,
  insetBox,
} from "@/lib/design/magnify";
import { isHexColor } from "@/lib/design/colors";
import { createDefaultDesign, defaultShotStyle } from "@/lib/design/defaults";
import { frameFits, frameForScreenshot } from "@/lib/design/devices";
import { isFrameKind } from "@/lib/design/frames";
import { insetAspect, insetFrameKind } from "@/lib/design/inset";
import {
  DEFAULT_GRADIENT,
  getGradientPreset,
  normalizeAngle,
} from "@/lib/design/gradients";
import { alignedPosition, computeLayout } from "@/lib/design/layout";
import type { Alignment } from "@/lib/design/layout";
import {
  BLUR,
  BORDER_WIDTH,
  MAX_FRAME_TEXT,
  PADDING,
  RADIUS,
  ROTATION,
  SHADOW_BLUR,
  SHADOW_OFFSET,
  SHOT_SCALE,
} from "@/lib/design/limits";
import { referencedImageIds } from "@/lib/design/refs";
import {
  annotationSchema,
  ARROW_STYLES,
  isLineEnd,
  LINE_ENDS,
  type Annotation,
  type AnnotationColor,
  type ArrowStyle,
  type LineEnd,
  type Background,
  type Design,
  type FrameKind,
  type FrameSpec,
  type ScreenshotAnnotation,
  type ShadowSpec,
  type MagnifyLens,
  type ShapeKind,
  type ShotLayer,
} from "@/lib/design/schema";
import { isShadowPresetId, SHADOW_PRESETS } from "@/lib/design/shadows";
import { CUSTOM_SIZE, getSizePreset } from "@/lib/design/sizes";
import { getWallpaper } from "@/lib/design/wallpapers";
import {
  DEFAULT_EXPORT_OPTIONS,
  sanitizeExportOptions,
  type ExportOptions,
} from "@/lib/export/options";
import type { LoadedImage } from "@/lib/image/load";
import { clamp } from "@/lib/utils";

export type PanelId = "background" | "style";
/** What a press on the canvas does: select and move, add a step, or draw a shape or an arrow. */
export type AnnotationTool = "select" | "step" | ShapeKind | "arrow" | "line";
/** The mobile layout also has a Size tab; null means its panel is closed. */
export type MobilePanelId = PanelId | "size";

/** `id` changes with every notice, so repeating a message still re-announces it. */
export type Notice = { id: number; kind: "error" | "info"; message: string };

/** Undo steps kept in each direction. */
export const HISTORY_LIMIT = 100;
/** Changes with the same key closer together than this become one undo step. */
export const MERGE_WINDOW_MS = 1000;
/** Distinct images the history may keep alive (decoded images are large). */
export const HISTORY_IMAGE_LIMIT = 5;

type ShadowPatch = Partial<Omit<ShadowSpec, "preset">>;
type BorderPatch = Partial<ShotLayer["border"]>;
type FramePatch = Partial<FrameSpec>;

export type EditorState = {
  design: Design;
  /** Older designs, oldest first. */
  past: Design[];
  /** Undone designs, next redo first. */
  future: Design[];
  /** Goes up with every change to `design`, including undo, redo and restore. */
  revision: number;
  /** Key and time of the last commit, for merging rapid changes into one step. */
  mergeKey: string | null;
  mergeAt: number;
  /** A drag or slider gesture is under way: its changes merge however slow it is. */
  gesture: boolean;

  /** Decoded images by id. The design refers to them by id. */
  images: Record<string, LoadedImage>;
  activePanel: PanelId;
  mobilePanel: MobilePanelId | null;
  loading: boolean;
  /** Reading the autosaved design on startup. */
  restoring: boolean;
  exporting: boolean;
  notice: Notice | null;
  exportOptions: ExportOptions;

  annotationTool: AnnotationTool;
  /** The colour new steps and shapes get. */
  annotationColor: AnnotationColor;
  /** Whether new shapes are filled, or transparent with a border. */
  shapeFilled: boolean;
  /** Whether new highlights have rounded corners. */
  highlightRounded: boolean;
  /** The look new arrows get. */
  arrowStyle: ArrowStyle;
  /** The end new lines get. */
  lineEnd: LineEnd;
  /** How strongly new blur boxes blur, 0 to 1. */
  blurIntensity: number;
  /** How much new magnifiers enlarge. */
  magnifyZoom: number;
  /** The shape new magnifiers get. */
  magnifyLens: MagnifyLens;
  /** Whether new magnifiers are insets, away from the area they enlarge. */
  magnifyInset: boolean;
  selectedAnnotationId: string | null;

  undo: () => void;
  redo: () => void;
  /** Ends the current merge, so the next change starts a new undo step. */
  sealHistory: () => void;
  /** Starts a drag or slider gesture: one undo step until sealHistory. */
  beginGesture: () => void;

  setImage: (image: LoadedImage) => void;
  clearImage: () => void;
  /** Frees images no design in the history refers to. Run after React has re-rendered. */
  pruneImages: () => void;

  setBackground: (background: Background) => void;
  setBackgroundImage: (image: LoadedImage) => void;
  applyGradientPreset: (id: string) => void;
  setGradientAngle: (degrees: number) => void;
  setGradientStop: (index: number, color: string) => void;
  /** Reverses the gradient's colours, keeping the stop positions. */
  swapGradientStops: () => void;
  setSolidColor: (color: string) => void;
  setWallpaper: (id: string) => void;
  setFromImage: () => void;
  setFromImageAngle: (degrees: number) => void;
  setTransparent: () => void;
  setBlur: (pixels: number) => void;

  setCanvasPreset: (id: string) => void;
  setCustomSize: (width: number, height: number) => void;

  setPadding: (pixels: number) => void;
  setScale: (scale: number) => void;
  /** Resizes the shot from a corner: its new scale and centre together. */
  resizeShot: (scale: number, x: number, y: number) => void;
  setPosition: (x: number, y: number) => void;
  /** Moves the shot by canvas pixels (fixed canvases only). */
  nudge: (dx: number, dy: number) => void;
  alignTo: (horizontal: Alignment, vertical: Alignment) => void;
  setRotation: (degrees: number) => void;
  setRadius: (pixels: number) => void;
  setShadowPreset: (id: string) => void;
  setShadow: (patch: ShadowPatch) => void;
  setBorder: (patch: BorderPatch) => void;
  setFrame: (patch: FramePatch) => void;
  resetStyle: () => void;

  setAnnotationTool: (tool: AnnotationTool) => void;
  /** Also recolours the selected annotation. */
  setAnnotationColor: (color: string) => void;
  /** Also changes the selected shape. */
  setShapeFilled: (filled: boolean) => void;
  /** Also changes the selected highlight. */
  setHighlightRounded: (rounded: boolean) => void;
  selectAnnotation: (id: string | null) => void;
  /** Adds a step numbered `nextStep` at a point on the screenshot. */
  addStep: (point: Point) => void;
  addShape: (shape: ShapeKind, box: Box) => void;
  /** Adds an arrow from its tail to the tip of its head, or a line from its plain end to its styled end. */
  addArrow: (start: Point, end: Point, line?: boolean) => void;
  /** Moves an arrow's ends. */
  setArrowEnds: (id: string, start: Point, end: Point) => void;
  /**
   * Restyles an arrow (or a line's end); new arrows (or lines) then take the
   * style too. An arrow never becomes a line, or a line an arrow.
   */
  setArrowStyle: (id: string | null, style: ArrowStyle | LineEnd) => void;
  /** Bends an arrow's middle to one side (see MAX_ARROW_BEND). */
  setArrowBend: (id: string, bend: number) => void;
  moveAnnotation: (id: string, point: Point) => void;
  /** Moves an annotation by canvas pixels, keeping it on the screenshot. */
  nudgeAnnotation: (id: string, dx: number, dy: number) => void;
  resizeShape: (id: string, box: Box) => void;
  /**
   * Adds a second screenshot beside the main one, or puts `image` in the one
   * there already, and selects it.
   */
  addScreenshot: (image: LoadedImage) => void;
  /** Moves and resizes a second screenshot; its height keeps to its shape. */
  resizeScreenshot: (id: string, x: number, y: number, width: number) => void;
  /** Puts a second screenshot in the main screenshot's frame, or takes it out. */
  /** The title or address a second screenshot's frame shows. */
  setScreenshotText: (
    id: string,
    patch: Partial<Pick<ScreenshotAnnotation, "title" | "url">>,
  ) => void;
  /** Changes a blur box's strength (0 to 1); new blur boxes then match it. */
  setBlurIntensity: (id: string | null, intensity: number) => void;
  /** Changes a magnifier's zoom; new magnifiers then match it. */
  setMagnifyZoom: (id: string | null, zoom: number) => void;
  /** Reshapes the selected magnifier; new magnifiers then match it. */
  setMagnifyLens: (lens: MagnifyLens) => void;
  /**
   * Turns the selected magnifier into an inset beside the area it enlarges,
   * or back over it; new magnifiers then match it.
   */
  setMagnifyInset: (inset: boolean) => void;
  /** Moves the area an inset magnifier enlarges. */
  moveMagnifySource: (id: string, point: Point) => void;
  /** Resizes a step about its new centre. New steps then take its size. */
  resizeStep: (id: string, centre: Point, size: number) => void;
  setStepNumber: (id: string, number: number) => void;
  removeAnnotation: (id: string) => void;
  /**
   * Adds a copy of `annotation` a little below and to the right of it, and
   * selects it. A copied step takes the next number. Returns the copy's id.
   */
  pasteAnnotation: (annotation: Annotation) => string | null;
  /** The next step is numbered 1 again. */
  resetStepCount: () => void;

  /** Replaces the design (an autosave restore). Clears the history. */
  loadDesign: (design: Design, images: LoadedImage[]) => void;
  /** Replaces the design with an opened project, as one undo step. */
  openProject: (design: Design, images: LoadedImage[]) => void;

  setActivePanel: (panel: PanelId) => void;
  setMobilePanel: (panel: MobilePanelId | null) => void;
  setLoading: (loading: boolean) => void;
  setRestoring: (restoring: boolean) => void;
  setExporting: (exporting: boolean) => void;
  setExportOptions: (patch: Partial<ExportOptions>) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
  dismissNotice: () => void;
};

// One screenshot layer until later milestones add more.
function updateShot(design: Design, patch: Partial<ShotLayer>): Design {
  const [shot] = design.layers;
  return { ...design, layers: [{ ...shot, ...patch }] };
}

const shotOf = (design: Design) => design.layers[0];

/** Canvas px per image width, or null without a screenshot. */
function imageUnit(state: EditorState): number | null {
  const image = selectActiveImage(state);
  return image ? computeLayout(image, state.design).shot.image.width : null;
}

/** Where annotations can go (the whole canvas), in image widths. */
function annotationArea(state: EditorState): Box | null {
  const image = selectActiveImage(state);
  if (!image) return null;
  const { canvas, shot } = computeLayout(image, state.design);
  return canvasArea(canvas, {
    ...shot.image,
    x: shot.x + shot.image.x,
    y: shot.y + shot.image.y,
  });
}

/** Room enough for anything, before there is a screenshot to measure. */
const FAR: Box = { x: -100, y: -100, width: 200, height: 200 };

/**
 * The settings a new magnifier for a drawn `box` gets. An inset's box is
 * the area it enlarges; the magnifier goes beside it.
 */
function newMagnifier(state: EditorState, box: Box) {
  const zoom = state.magnifyZoom;
  const lens = state.magnifyLens;
  if (!state.magnifyInset) return { zoom, lens };
  const area = annotationArea(state) ?? FAR;
  const square = lens === "circle";
  return {
    zoom,
    lens,
    ...roundBox(fitBox(insetBox(box, zoom, area), area, square)),
    from: roundPoint({ x: box.x + box.width / 2, y: box.y + box.height / 2 }),
  };
}

/** From an arrow's tail to its tip, rounded like the positions. */
const arrowDelta = (from: Point, to: Point) => ({
  dx: Math.round((to.x - from.x) * 10000) / 10000,
  dy: Math.round((to.y - from.y) * 10000) / 10000,
});

/** Adding an annotation leaves the old selection behind. */
const NO_SELECTION = { selectedAnnotationId: null };
/**
 * A new second screenshot's gap from the main one, the least room beside it
 * that it goes in, and its width over the main one without that room, in
 * image widths.
 */
const INSET_GAP = 0.08;
const MIN_INSET_ROOM = 0.3;
const INSET_WIDTH = 0.6;

/** A second screenshot with the height its image and frame give it. */
function withInsetHeight(
  annotation: ScreenshotAnnotation,
  images: Record<string, LoadedImage>,
  mainFrame: FrameKind,
): ScreenshotAnnotation {
  const image = images[annotation.imageId];
  if (!image) return annotation;
  const height =
    Math.round(
      annotation.width * insetAspect(image, insetFrameKind(mainFrame)) * 10000,
    ) / 10000;
  return height === annotation.height ? annotation : { ...annotation, height };
}
/** How far a pasted copy sits from its original, across and down, in image widths. */
const PASTE_OFFSET = 0.02;

/** A new screenshot starts without the old one's annotations. */
const withoutAnnotations = (design: Design): Design =>
  design.annotations.length === 0 && design.nextStep === 1
    ? design
    : { ...design, annotations: [], nextStep: 1 };

function updateAnnotation(
  design: Design,
  id: string,
  update: (annotation: Annotation) => Annotation | null,
): Design | null {
  let changed = false;
  const annotations = design.annotations.map((annotation) => {
    if (annotation.id !== id) return annotation;
    const next = update(annotation);
    if (!next) return annotation;
    changed = true;
    return next;
  });
  return changed ? { ...design, annotations } : null;
}

const round = (value: number, places: number) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const finite = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

function sameDesign(a: Design, b: Design): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** Drops the oldest past designs until the history keeps few enough images alive. */
function trimPastForImages(past: Design[], present: Design): Design[] {
  const countImages = (designs: Design[]) =>
    new Set(designs.flatMap(referencedImageIds)).size;
  let start = 0;
  while (
    start < past.length &&
    countImages([...past.slice(start), present]) > HISTORY_IMAGE_LIMIT
  )
    start += 1;
  return start === 0 ? past : past.slice(start);
}

/**
 * Applies a design change as one history step, or merges it into the previous
 * step when `mergeKey` matches a commit less than MERGE_WINDOW_MS ago (or any
 * time during a gesture). A merged run that ends where it began is no step.
 * Returns `state` itself (no update at all) when nothing changed.
 */
function commitDesign(
  state: EditorState,
  next: Design,
  mergeKey?: string,
  extra?: Partial<EditorState>,
): Partial<EditorState> | EditorState {
  if (sameDesign(next, state.design)) return extra ? extra : state;
  const now = Date.now();
  const merge =
    mergeKey !== undefined &&
    mergeKey === state.mergeKey &&
    (state.gesture || now - state.mergeAt < MERGE_WINDOW_MS);
  let past = merge
    ? state.past
    : [...state.past, state.design].slice(-HISTORY_LIMIT);
  // Back where the run started: drop its step, and start afresh from here so
  // the next change keeps this state as its own step.
  const before = past.at(-1);
  const undone = merge && before !== undefined && sameDesign(next, before);
  if (undone) past = past.slice(0, -1);
  return {
    ...extra,
    design: next,
    past: trimPastForImages(past, next),
    future: [],
    revision: state.revision + 1,
    mergeKey: undone ? null : (mergeKey ?? null),
    mergeAt: now,
  };
}

export const useEditorStore = create<EditorState>()((set, get) => {
  /** For actions that only change the design. A null recipe result changes nothing. */
  const commit = (
    recipe: (design: Design) => Design | null,
    key?: string,
    extra?: Partial<EditorState>,
  ) =>
    set((state) => {
      const next = recipe(state.design);
      return next ? commitDesign(state, next, key, extra) : state;
    });

  const commitShot = (
    recipe: (shot: ShotLayer, design: Design) => Partial<ShotLayer> | null,
    key?: string,
  ) =>
    commit((design) => {
      const patch = recipe(shotOf(design), design);
      return patch ? updateShot(design, patch) : null;
    }, key);

  const setBackgroundTo = (background: Background, key?: string) =>
    commit((design) => ({ ...design, background }), key);

  return {
    design: createDefaultDesign(),
    past: [],
    future: [],
    revision: 0,
    mergeKey: null,
    mergeAt: 0,
    gesture: false,
    images: {},
    activePanel: "background",
    mobilePanel: null,
    loading: false,
    restoring: false,
    exporting: false,
    notice: null,
    exportOptions: { ...DEFAULT_EXPORT_OPTIONS },
    annotationTool: "select",
    annotationColor: DEFAULT_ANNOTATION_COLOR,
    shapeFilled: false,
    highlightRounded: false,
    arrowStyle: ARROW_STYLES[0],
    lineEnd: LINE_ENDS[0],
    blurIntensity: DEFAULT_BLUR_INTENSITY,
    magnifyZoom: DEFAULT_MAGNIFY_ZOOM,
    magnifyLens: DEFAULT_MAGNIFY_LENS,
    magnifyInset: false,
    selectedAnnotationId: null,

    undo: () =>
      set((state) => {
        const previous = state.past.at(-1);
        if (!previous) return state;
        return {
          design: previous,
          past: state.past.slice(0, -1),
          future: [state.design, ...state.future].slice(0, HISTORY_LIMIT),
          revision: state.revision + 1,
          mergeKey: null,
        };
      }),

    redo: () =>
      set((state) => {
        const [next, ...rest] = state.future;
        if (!next) return state;
        return {
          design: next,
          past: [...state.past, state.design].slice(-HISTORY_LIMIT),
          future: rest,
          revision: state.revision + 1,
          mergeKey: null,
        };
      }),

    sealHistory: () =>
      set((state) =>
        state.mergeKey === null && !state.gesture
          ? state
          : { mergeKey: null, gesture: false },
      ),

    beginGesture: () => set(() => ({ mergeKey: null, gesture: true })),

    setImage: (image) =>
      set((state) =>
        commitDesign(
          state,
          updateShot(withoutAnnotations(state.design), {
            imageId: image.id,
            // A phone around a laptop screenshot looks wrong: swap the device.
            frame: {
              ...shotOf(state.design).frame,
              kind: frameForScreenshot(shotOf(state.design).frame.kind, image),
            },
          }),
          undefined,
          {
            images: { ...state.images, [image.id]: image },
            notice: null,
            selectedAnnotationId: null,
          },
        ),
      ),

    clearImage: () =>
      set((state) =>
        commitDesign(
          state,
          updateShot(withoutAnnotations(state.design), { imageId: null }),
          undefined,
          { selectedAnnotationId: null },
        ),
      ),

    pruneImages: () => {
      const { images, design, past, future } = get();
      const used = new Set(
        [...past, design, ...future].flatMap(referencedImageIds),
      );
      const unused = Object.values(images).filter(
        (image) => !used.has(image.id),
      );
      if (unused.length === 0) return;
      for (const image of unused) image.release();
      set(() => ({
        images: Object.fromEntries(
          Object.entries(images).filter(([id]) => used.has(id)),
        ),
      }));
    },

    setBackground: (background) => setBackgroundTo(background),

    setBackgroundImage: (image) =>
      set((state) =>
        commitDesign(
          state,
          {
            ...state.design,
            background: {
              kind: "image",
              source: { type: "upload", imageId: image.id },
            },
          },
          undefined,
          { images: { ...state.images, [image.id]: image }, notice: null },
        ),
      ),

    applyGradientPreset: (id) => {
      const preset = getGradientPreset(id);
      if (!preset) return;
      // Always linear: an older design with a radial gradient turns linear here.
      commit((design) => ({
        ...design,
        background: {
          kind: "linear",
          presetId: preset.id,
          angle: preset.angle,
          stops: preset.stops.map((stop) => ({ ...stop })),
        },
      }));
    },

    setGradientAngle: (degrees) =>
      commit((design) => {
        const background = design.background;
        if (background.kind !== "linear") return null;
        return {
          ...design,
          background: { ...background, angle: normalizeAngle(degrees) },
        };
      }, "gradient-angle"),

    swapGradientStops: () =>
      commit((design) => {
        const background = design.background;
        if (background.kind !== "linear" && background.kind !== "radial")
          return null;
        const colors = background.stops.map((stop) => stop.color).reverse();
        const stops = background.stops.map((stop, i) => ({
          ...stop,
          color: colors[i],
        }));
        return {
          ...design,
          background: { ...background, presetId: null, stops },
        };
      }),

    setGradientStop: (index, color) =>
      commit((design) => {
        const background = design.background;
        if (background.kind !== "linear" && background.kind !== "radial")
          return null;
        if (!isHexColor(color) || !background.stops[index]) return null;
        const stops = background.stops.map((stop, i) =>
          i === index ? { ...stop, color: color.toLowerCase() } : { ...stop },
        );
        return {
          ...design,
          background: { ...background, presetId: null, stops },
        };
      }, `gradient-stop-${index}`),

    setSolidColor: (color) => {
      if (!isHexColor(color)) return;
      setBackgroundTo({ kind: "solid", color: color.toLowerCase() }, "solid");
    },

    setWallpaper: (id) => {
      if (!getWallpaper(id)) return;
      setBackgroundTo({
        kind: "image",
        source: { type: "wallpaper", wallpaperId: id },
      });
    },

    setFromImage: () =>
      commit((design) => {
        if (design.background.kind === "fromImage") return null;
        const angle =
          design.background.kind === "linear"
            ? design.background.angle
            : DEFAULT_GRADIENT.angle;
        return { ...design, background: { kind: "fromImage", angle } };
      }),

    setFromImageAngle: (degrees) =>
      commit((design) => {
        if (design.background.kind !== "fromImage") return null;
        return {
          ...design,
          background: { kind: "fromImage", angle: normalizeAngle(degrees) },
        };
      }, "from-image-angle"),

    setTransparent: () => setBackgroundTo({ kind: "transparent" }),

    setBlur: (pixels) => {
      if (!finite(pixels)) return;
      commit(
        (design) => ({
          ...design,
          backgroundFx: {
            ...design.backgroundFx,
            blur: Math.round(clamp(pixels, BLUR.min, BLUR.max)),
          },
        }),
        "blur",
      );
    },

    setCanvasPreset: (id) => {
      if (id === "auto") {
        commit((design) => ({ ...design, canvas: { preset: "auto" } }));
        return;
      }
      const preset = getSizePreset(id);
      if (!preset) return;
      commit((design) => ({
        ...design,
        canvas: {
          preset: preset.id,
          width: preset.width,
          height: preset.height,
        },
      }));
    },

    setCustomSize: (width, height) => {
      if (!finite(width) || !finite(height)) return;
      const side = (value: number) =>
        Math.round(clamp(value, CUSTOM_SIZE.min, CUSTOM_SIZE.max));
      commit(
        (design) => ({
          ...design,
          canvas: {
            preset: "custom",
            width: side(width),
            height: side(height),
          },
        }),
        "custom-size",
      );
    },

    setPadding: (pixels) => {
      if (!finite(pixels)) return;
      commitShot(
        () => ({
          padding: Math.round(clamp(pixels, PADDING.min, PADDING.max)),
        }),
        "padding",
      );
    },

    setScale: (scale) => {
      if (!finite(scale)) return;
      commitShot(
        () => ({
          scale: round(clamp(scale, SHOT_SCALE.min, SHOT_SCALE.max), 2),
        }),
        "scale",
      );
    },

    resizeShot: (scale, x, y) => {
      if (!finite(scale) || !finite(x) || !finite(y)) return;
      commitShot(
        () => ({
          scale: round(clamp(scale, SHOT_SCALE.min, SHOT_SCALE.max), 3),
          position: {
            x: round(clamp(x, 0, 1), 4),
            y: round(clamp(y, 0, 1), 4),
          },
        }),
        "resize",
      );
    },

    setPosition: (x, y) => {
      if (!finite(x) || !finite(y)) return;
      commitShot(
        () => ({
          position: {
            x: round(clamp(x, 0, 1), 4),
            y: round(clamp(y, 0, 1), 4),
          },
        }),
        "position",
      );
    },

    nudge: (dx, dy) => {
      if (!finite(dx) || !finite(dy)) return;
      commitShot((shot, design) => {
        if (design.canvas.preset === "auto") return null;
        const { width, height } = design.canvas;
        return {
          position: {
            x: round(clamp(shot.position.x + dx / width, 0, 1), 4),
            y: round(clamp(shot.position.y + dy / height, 0, 1), 4),
          },
        };
      }, "position");
    },

    alignTo: (horizontal, vertical) => {
      const state = get();
      const image = selectActiveImage(state);
      if (!image || state.design.canvas.preset === "auto") return;
      const layout = computeLayout(image, state.design);
      const position = alignedPosition(
        layout,
        shotOf(state.design).padding,
        horizontal,
        vertical,
      );
      commitShot(() => ({
        position: { x: round(position.x, 4), y: round(position.y, 4) },
      }));
    },

    setRotation: (degrees) => {
      if (!finite(degrees)) return;
      commitShot(
        () => ({
          rotation: Math.round(clamp(degrees, ROTATION.min, ROTATION.max)) + 0,
        }),
        "rotation",
      );
    },

    setRadius: (pixels) => {
      if (!finite(pixels)) return;
      commitShot(
        () => ({ radius: Math.round(clamp(pixels, RADIUS.min, RADIUS.max)) }),
        "radius",
      );
    },

    setShadowPreset: (id) => {
      // Radix toggle groups report "" when the active item is clicked again.
      if (!isShadowPresetId(id)) return;
      commitShot(() => ({ shadow: { ...SHADOW_PRESETS[id] } }));
    },

    setShadow: (patch) =>
      commitShot(
        (shot) => {
          const next: ShadowSpec = { ...shot.shadow, preset: "custom" };
          if (finite(patch.offsetX))
            next.offsetX = Math.round(
              clamp(patch.offsetX, SHADOW_OFFSET.min, SHADOW_OFFSET.max),
            );
          if (finite(patch.offsetY))
            next.offsetY = Math.round(
              clamp(patch.offsetY, SHADOW_OFFSET.min, SHADOW_OFFSET.max),
            );
          if (finite(patch.blur))
            next.blur = Math.round(
              clamp(patch.blur, SHADOW_BLUR.min, SHADOW_BLUR.max),
            );
          if (finite(patch.opacity))
            next.opacity = round(clamp(patch.opacity, 0, 1), 2);
          if (patch.color !== undefined) {
            if (!isHexColor(patch.color)) return null;
            next.color = patch.color.toLowerCase();
          }
          return { shadow: next };
        },
        `shadow-${Object.keys(patch).sort().join()}`,
      ),

    setBorder: (patch) =>
      commitShot(
        (shot) => {
          const next = { ...shot.border };
          if (finite(patch.width))
            next.width = Math.round(
              clamp(patch.width, BORDER_WIDTH.min, BORDER_WIDTH.max),
            );
          if (finite(patch.opacity))
            next.opacity = round(clamp(patch.opacity, 0, 1), 2);
          if (patch.color !== undefined) {
            if (!isHexColor(patch.color)) return null;
            next.color = patch.color.toLowerCase();
          }
          return { border: next };
        },
        `border-${Object.keys(patch).sort().join()}`,
      ),

    setFrame: (patch) =>
      commit(
        (design) => {
          const next = { ...shotOf(design).frame };
          if (patch.kind !== undefined) {
            if (!isFrameKind(patch.kind)) return null;
            const image = selectActiveImage(get());
            if (image && !frameFits(patch.kind, image)) return null;
            next.kind = patch.kind;
          }
          if (patch.theme !== undefined) {
            if (patch.theme !== "light" && patch.theme !== "dark") return null;
            next.theme = patch.theme;
          }
          if (typeof patch.title === "string")
            next.title = patch.title.slice(0, MAX_FRAME_TEXT);
          if (typeof patch.url === "string")
            next.url = patch.url.slice(0, MAX_FRAME_TEXT);
          // Second screenshots in the frame take its new bar height.
          const { images } = get();
          return {
            ...updateShot(design, { frame: next }),
            annotations: design.annotations.map((annotation) =>
              annotation.kind === "screenshot"
                ? withInsetHeight(annotation, images, next.kind)
                : annotation,
            ),
          };
        },
        // Typing a title or address merges; picking a frame or theme doesn't.
        patch.kind === undefined && patch.theme === undefined
          ? `frame-${Object.keys(patch).sort().join()}`
          : undefined,
      ),

    resetStyle: () => commitShot(() => defaultShotStyle()),

    setAnnotationTool: (tool) =>
      set(() => ({ annotationTool: tool, selectedAnnotationId: null })),

    setAnnotationColor: (color) => {
      if (!isAnnotationColor(color)) return;
      set(() => ({ annotationColor: color }));
      const id = get().selectedAnnotationId;
      if (id)
        commit((design) =>
          updateAnnotation(design, id, (annotation) =>
            // A second screenshot has no colour.
            annotation.kind === "screenshot" || annotation.color === color
              ? null
              : { ...annotation, color },
          ),
        );
    },

    setHighlightRounded: (rounded) => {
      set(() => ({ highlightRounded: rounded }));
      const id = get().selectedAnnotationId;
      if (id)
        commit((design) =>
          updateAnnotation(design, id, (annotation) =>
            annotation.kind !== "shape" ||
            annotation.shape !== "highlight" ||
            (annotation.rounded ?? false) === rounded
              ? null
              : { ...annotation, rounded },
          ),
        );
    },

    setShapeFilled: (filled) => {
      set(() => ({ shapeFilled: filled }));
      const id = get().selectedAnnotationId;
      if (id)
        commit((design) =>
          updateAnnotation(design, id, (annotation) =>
            annotation.kind !== "shape" || annotation.filled === filled
              ? null
              : { ...annotation, filled },
          ),
        );
    },

    selectAnnotation: (id) =>
      set((state) => {
        if (state.selectedAnnotationId === id) return state;
        const annotation = id
          ? state.design.annotations.find((item) => item.id === id)
          : undefined;
        if (id && !annotation) return state;
        // The toolbar shows the selected annotation's colour and fill.
        return {
          selectedAnnotationId: id,
          ...(annotation &&
            annotation.kind !== "screenshot" && {
              annotationColor: annotation.color,
              ...(annotation.kind === "shape" && {
                shapeFilled: annotation.filled,
              }),
              ...(annotation.kind === "shape" &&
                annotation.shape === "highlight" && {
                  highlightRounded: annotation.rounded ?? false,
                }),
              ...(annotation.kind === "shape" &&
                annotation.shape === "magnify" && {
                  magnifyZoom: annotation.zoom ?? DEFAULT_MAGNIFY_ZOOM,
                  magnifyLens: annotation.lens ?? DEFAULT_MAGNIFY_LENS,
                  magnifyInset: annotation.from !== undefined,
                }),
            }),
        };
      }),

    addStep: (point) =>
      commit(
        (design) => {
          if (!finite(point.x) || !finite(point.y)) return null;
          const number = Math.min(design.nextStep, MAX_STEP_NUMBER);
          return {
            ...design,
            annotations: [
              ...design.annotations,
              {
                id: newAnnotationId(),
                kind: "step",
                ...roundPoint(point),
                number,
                color: get().annotationColor,
                // The size of the last step: resizing one sets it for the rest.
                size:
                  design.annotations.findLast((item) => item.kind === "step")
                    ?.size ?? 1,
              },
            ],
            nextStep: Math.min(number + 1, MAX_STEP_NUMBER),
          };
        },
        undefined,
        NO_SELECTION,
      ),

    addShape: (shape, box) =>
      commit(
        (design) => {
          if (![box.x, box.y, box.width, box.height].every(finite)) return null;
          if (box.width <= 0 || box.height <= 0) return null;
          return {
            ...design,
            annotations: [
              ...design.annotations,
              {
                id: newAnnotationId(),
                kind: "shape",
                shape,
                ...roundBox(box),
                color: get().annotationColor,
                filled: get().shapeFilled,
                ...(shape === "blur" ? { intensity: get().blurIntensity } : {}),
                ...(shape === "magnify" ? newMagnifier(get(), box) : {}),
                ...(shape === "highlight"
                  ? { rounded: get().highlightRounded }
                  : {}),
              },
            ],
          };
        },
        undefined,
        NO_SELECTION,
      ),

    addArrow: (start, end, line = false) => {
      if (![start.x, start.y, end.x, end.y].every(finite)) return;
      const from = roundPoint(start);
      const to = roundPoint(end);
      if (from.x === to.x && from.y === to.y) return;
      commit(
        (design) => ({
          ...design,
          annotations: [
            ...design.annotations,
            {
              id: newAnnotationId(),
              kind: "arrow",
              ...from,
              ...arrowDelta(from, to),
              color: get().annotationColor,
              style: line ? get().lineEnd : get().arrowStyle,
              bend: 0,
            },
          ],
        }),
        undefined,
        NO_SELECTION,
      );
    },

    setArrowEnds: (id, start, end) => {
      if (![start.x, start.y, end.x, end.y].every(finite)) return;
      const from = roundPoint(start);
      const to = roundPoint(end);
      // An arrow always points somewhere.
      if (from.x === to.x && from.y === to.y) return;
      const delta = arrowDelta(from, to);
      commit(
        (design) =>
          updateAnnotation(design, id, (annotation) =>
            annotation.kind !== "arrow" ||
            (annotation.x === from.x &&
              annotation.y === from.y &&
              annotation.dx === delta.dx &&
              annotation.dy === delta.dy)
              ? null
              : { ...annotation, ...from, ...delta },
          ),
        `annotation-resize-${id}`,
      );
    },

    setArrowStyle: (id, style) => {
      const line = isLineEnd(style);
      if (line) set(() => ({ lineEnd: style }));
      else if ((ARROW_STYLES as readonly string[]).includes(style))
        set(() => ({ arrowStyle: style as ArrowStyle }));
      else return;
      if (!id) return;
      commit((design) =>
        updateAnnotation(design, id, (annotation) =>
          annotation.kind !== "arrow" ||
          annotation.style === style ||
          isLineEnd(annotation.style) !== line
            ? null
            : { ...annotation, style },
        ),
      );
    },

    setArrowBend: (id, bend) => {
      if (!finite(bend)) return;
      const to =
        Math.round(
          Math.max(-MAX_ARROW_BEND, Math.min(MAX_ARROW_BEND, bend)) * 1000,
        ) / 1000;
      commit(
        (design) =>
          updateAnnotation(design, id, (annotation) =>
            annotation.kind !== "arrow" ||
            annotation.style === "chevrons" ||
            annotation.bend === to
              ? null
              : { ...annotation, bend: to },
          ),
        `annotation-bend-${id}`,
      );
    },

    moveAnnotation: (id, point) => {
      if (!finite(point.x) || !finite(point.y)) return;
      const to = roundPoint(point);
      commit(
        (design) =>
          updateAnnotation(design, id, (annotation) =>
            annotation.x === to.x && annotation.y === to.y
              ? null
              : { ...annotation, ...to },
          ),
        `annotation-move-${id}`,
      );
    },

    nudgeAnnotation: (id, dx, dy) => {
      if (!finite(dx) || !finite(dy)) return;
      const state = get();
      const unit = imageUnit(state);
      const area = annotationArea(state);
      if (!unit || !area) return;
      commit(
        (design) =>
          updateAnnotation(design, id, (annotation) => {
            const moved = {
              x: annotation.x + dx / unit,
              y: annotation.y + dy / unit,
            };
            const to =
              annotation.kind === "step"
                ? clampToArea(moved, area)
                : annotation.kind === "arrow"
                  ? fitArrow(
                      moved,
                      { x: annotation.dx, y: annotation.dy },
                      area,
                    )
                  : fitBox(
                      { ...annotation, ...moved },
                      area,
                      annotation.kind === "shape" && isSquareShape(annotation),
                    );
            const rounded = roundPoint(to);
            return rounded.x === annotation.x && rounded.y === annotation.y
              ? null
              : { ...annotation, x: rounded.x, y: rounded.y };
          }),
        `annotation-move-${id}`,
      );
    },

    setBlurIntensity: (id, intensity) => {
      if (!finite(intensity)) return;
      const to = Math.round(Math.min(1, Math.max(0, intensity)) * 100) / 100;
      set(() => ({ blurIntensity: to }));
      if (!id) return;
      commit(
        (design) =>
          updateAnnotation(design, id, (annotation) =>
            annotation.kind !== "shape" ||
            annotation.shape !== "blur" ||
            annotation.intensity === to
              ? null
              : { ...annotation, intensity: to },
          ),
        `annotation-blur-${id}`,
      );
    },

    setMagnifyZoom: (id, zoom) => {
      if (!finite(zoom)) return;
      const to = clampMagnifyZoom(zoom);
      set(() => ({ magnifyZoom: to }));
      if (!id) return;
      commit(
        (design) =>
          updateAnnotation(design, id, (annotation) =>
            annotation.kind !== "shape" ||
            annotation.shape !== "magnify" ||
            annotation.zoom === to
              ? null
              : { ...annotation, zoom: to },
          ),
        `annotation-magnify-${id}`,
      );
    },

    setMagnifyLens: (lens) => {
      set(() => ({ magnifyLens: lens }));
      const id = get().selectedAnnotationId;
      if (!id) return;
      commit((design) =>
        updateAnnotation(design, id, (annotation) => {
          if (
            annotation.kind !== "shape" ||
            annotation.shape !== "magnify" ||
            (annotation.lens ?? DEFAULT_MAGNIFY_LENS) === lens
          )
            return null;
          if (lens !== "circle") return { ...annotation, lens };
          // A circle's box is square, about the same centre.
          const side = Math.min(annotation.width, annotation.height);
          return {
            ...annotation,
            lens,
            ...roundBox({
              x: annotation.x + (annotation.width - side) / 2,
              y: annotation.y + (annotation.height - side) / 2,
              width: side,
              height: side,
            }),
          };
        }),
      );
    },

    setMagnifyInset: (inset) => {
      set(() => ({ magnifyInset: inset }));
      const id = get().selectedAnnotationId;
      if (!id) return;
      const area = annotationArea(get()) ?? FAR;
      commit((design) =>
        updateAnnotation(design, id, (annotation) => {
          if (
            annotation.kind !== "shape" ||
            annotation.shape !== "magnify" ||
            (annotation.from !== undefined) === inset
          )
            return null;
          const zoom = annotation.zoom ?? DEFAULT_MAGNIFY_ZOOM;
          const square = isSquareShape(annotation);
          if (inset) {
            // It keeps enlarging what it covers, from beside it.
            const from = {
              x: annotation.x + annotation.width / 2,
              y: annotation.y + annotation.height / 2,
            };
            const source = {
              x: from.x - annotation.width / zoom / 2,
              y: from.y - annotation.height / zoom / 2,
              width: annotation.width / zoom,
              height: annotation.height / zoom,
            };
            return {
              ...annotation,
              ...roundBox(fitBox(insetBox(source, zoom, area), area, square)),
              from: roundPoint(from),
            };
          }
          // Back over the area it enlarges.
          const { from, ...rest } = annotation;
          if (!from) return null;
          return {
            ...rest,
            ...roundBox(
              fitBox(
                {
                  x: from.x - annotation.width / 2,
                  y: from.y - annotation.height / 2,
                  width: annotation.width,
                  height: annotation.height,
                },
                area,
                square,
              ),
            ),
          };
        }),
      );
    },

    moveMagnifySource: (id, point) => {
      if (!finite(point.x) || !finite(point.y)) return;
      const to = roundPoint(point);
      commit(
        (design) =>
          updateAnnotation(design, id, (annotation) =>
            annotation.kind !== "shape" ||
            !annotation.from ||
            (annotation.from.x === to.x && annotation.from.y === to.y)
              ? null
              : { ...annotation, from: to },
          ),
        `annotation-from-${id}`,
      );
    },

    resizeShape: (id, box) => {
      if (![box.x, box.y, box.width, box.height].every(finite)) return;
      commit(
        (design) =>
          updateAnnotation(design, id, (annotation) =>
            annotation.kind === "shape"
              ? { ...annotation, ...roundBox(box) }
              : null,
          ),
        `annotation-resize-${id}`,
      );
    },

    addScreenshot: (image) => {
      const state = get();
      const main = selectActiveImage(state);
      if (!main) return;
      const kind = insetFrameKind(shotOf(state.design).frame.kind);
      const existing = state.design.annotations.find(
        (annotation) => annotation.kind === "screenshot",
      );
      const extra = {
        images: { ...state.images, [image.id]: image },
        notice: null,
        annotationTool: "select" as const,
      };
      // There's only ever one: a new image goes in its place, as wide.
      if (existing) {
        const id = existing.id;
        set((current) =>
          commitDesign(
            current,
            updateAnnotation(current.design, id, (annotation) =>
              annotation.kind === "screenshot"
                ? withInsetHeight(
                    { ...annotation, imageId: image.id },
                    { [image.id]: image },
                    kind,
                  )
                : null,
            ) ?? current.design,
            undefined,
            { ...extra, selectedAnnotationId: id },
          ),
        );
        return;
      }
      const area = annotationArea(state) ?? FAR;
      const aspect = insetAspect(image, kind);
      // Level with the top of the main screenshot's frame.
      const { shot } = computeLayout(main, state.design);
      const top = -shot.image.y / shot.image.width;
      // To the right of the main screenshot and as wide, where there's room;
      // otherwise over it.
      const left = 1 + INSET_GAP;
      const room = Math.min(
        area.x + area.width - left,
        (area.y + area.height - top) / aspect,
      );
      const width = room >= MIN_INSET_ROOM ? Math.min(1, room) : INSET_WIDTH;
      const box = roundBox(
        fitBox({ x: left, y: top, width, height: width * aspect }, area),
      );
      const id = newAnnotationId();
      set((current) =>
        commitDesign(
          current,
          {
            ...current.design,
            annotations: [
              ...current.design.annotations,
              {
                id,
                kind: "screenshot",
                imageId: image.id,
                ...box,
                title: "",
                url: "",
              },
            ],
          },
          undefined,
          { ...extra, selectedAnnotationId: id },
        ),
      );
    },

    resizeScreenshot: (id, x, y, width) => {
      if (![x, y, width].every(finite) || width <= 0) return;
      commit(
        (design) =>
          updateAnnotation(design, id, (annotation) =>
            annotation.kind === "screenshot"
              ? {
                  ...annotation,
                  ...roundBox({
                    x,
                    y,
                    width,
                    height: width * (annotation.height / annotation.width),
                  }),
                }
              : null,
          ),
        `annotation-resize-${id}`,
      );
    },

    setScreenshotText: (id, patch) =>
      commit(
        (design) =>
          updateAnnotation(design, id, (annotation) => {
            if (annotation.kind !== "screenshot") return null;
            const next = { ...annotation };
            if (typeof patch.title === "string")
              next.title = patch.title.slice(0, MAX_FRAME_TEXT);
            if (typeof patch.url === "string")
              next.url = patch.url.slice(0, MAX_FRAME_TEXT);
            return next.title === annotation.title &&
              next.url === annotation.url
              ? null
              : next;
          }),
        // Typing merges into one step.
        `screenshot-text-${id}`,
      ),

    resizeStep: (id, centre, size) => {
      if (!finite(centre.x) || !finite(centre.y) || !finite(size)) return;
      const to = { ...roundPoint(centre), size: clampStepSize(size) };
      commit((design) => {
        const step = design.annotations.find((item) => item.id === id);
        if (
          step?.kind !== "step" ||
          (step.x === to.x && step.y === to.y && step.size === to.size)
        )
          return null;
        // Moved to the end of the list, so new steps take its size.
        return {
          ...design,
          annotations: [
            ...design.annotations.filter((item) => item.id !== id),
            { ...step, ...to },
          ],
        };
      }, `annotation-resize-${id}`);
    },

    setStepNumber: (id, number) => {
      if (!Number.isInteger(number) || number < 1 || number > MAX_STEP_NUMBER)
        return;
      commit((design) => {
        const next = updateAnnotation(design, id, (annotation) =>
          annotation.kind === "step" && annotation.number !== number
            ? { ...annotation, number }
            : null,
        );
        if (!next) return null;
        // Carry on counting from the highest step.
        const highest = Math.max(
          ...next.annotations.map((item) =>
            item.kind === "step" ? item.number : 0,
          ),
        );
        return {
          ...next,
          nextStep: Math.min(
            Math.max(next.nextStep, highest + 1),
            MAX_STEP_NUMBER,
          ),
        };
      }, `step-number-${id}`);
    },

    removeAnnotation: (id) =>
      set((state) => {
        const annotations = state.design.annotations.filter(
          (annotation) => annotation.id !== id,
        );
        if (annotations.length === state.design.annotations.length)
          return state;
        return commitDesign(
          state,
          { ...state.design, annotations },
          undefined,
          {
            selectedAnnotationId:
              state.selectedAnnotationId === id
                ? null
                : state.selectedAnnotationId,
          },
        );
      }),

    pasteAnnotation: (annotation) => {
      // There's only one second screenshot.
      if (annotation.kind === "screenshot") return null;
      const state = get();
      const area = annotationArea(state) ?? FAR;
      const id = newAnnotationId();
      const moved = {
        x: annotation.x + PASTE_OFFSET,
        y: annotation.y + PASTE_OFFSET,
      };
      const to = roundPoint(
        annotation.kind === "step"
          ? clampToArea(moved, area)
          : annotation.kind === "arrow"
            ? fitArrow(moved, { x: annotation.dx, y: annotation.dy }, area)
            : fitBox(
                { ...annotation, ...moved },
                area,
                annotation.kind === "shape" && isSquareShape(annotation),
              ),
      );
      const number = state.design.nextStep;
      const copy: Annotation =
        annotation.kind === "step"
          ? { ...annotation, id, ...to, number }
          : annotation.kind === "shape" && annotation.from
            ? {
                ...annotation,
                id,
                x: to.x,
                y: to.y,
                // An inset keeps enlarging the same spot, moved with it.
                from: roundPoint({
                  x: annotation.from.x + to.x - annotation.x,
                  y: annotation.from.y + to.y - annotation.y,
                }),
              }
            : { ...annotation, id, x: to.x, y: to.y };
      const parsed = annotationSchema.safeParse(copy);
      if (!parsed.success) return null;
      commit(
        (design) => ({
          ...design,
          annotations: [...design.annotations, parsed.data],
          ...(annotation.kind === "step" && {
            nextStep: Math.min(number + 1, MAX_STEP_NUMBER),
          }),
        }),
        undefined,
        { selectedAnnotationId: id },
      );
      return id;
    },

    resetStepCount: () =>
      commit((design) =>
        design.nextStep === 1 ? null : { ...design, nextStep: 1 },
      ),

    loadDesign: (design, images) =>
      set((state) => {
        // A new copy of an image already held replaces it: free the old one.
        for (const image of images) {
          const held = state.images[image.id];
          if (held && held !== image) held.release();
        }
        return {
          design,
          past: [],
          future: [],
          revision: state.revision + 1,
          mergeKey: null,
          selectedAnnotationId: null,
          images: {
            ...state.images,
            ...Object.fromEntries(images.map((image) => [image.id, image])),
          },
        };
      }),

    openProject: (design, images) =>
      set((state) =>
        commitDesign(state, design, undefined, {
          images: {
            ...state.images,
            ...Object.fromEntries(images.map((image) => [image.id, image])),
          },
          selectedAnnotationId: null,
        }),
      ),

    setActivePanel: (panel) => set(() => ({ activePanel: panel })),
    setMobilePanel: (panel) => set(() => ({ mobilePanel: panel })),
    setLoading: (loading) => set(() => ({ loading })),
    setRestoring: (restoring) => set(() => ({ restoring })),
    setExporting: (exporting) => set(() => ({ exporting })),
    setExportOptions: (patch) =>
      set((state) => ({
        exportOptions: sanitizeExportOptions({
          ...state.exportOptions,
          ...patch,
        }),
      })),
    showError: (message) =>
      set((state) => ({
        notice: { id: (state.notice?.id ?? 0) + 1, kind: "error", message },
      })),
    showInfo: (message) =>
      set((state) => ({
        notice: { id: (state.notice?.id ?? 0) + 1, kind: "info", message },
      })),
    dismissNotice: () => set(() => ({ notice: null })),
  };
});

export const selectShot = (state: EditorState): ShotLayer =>
  state.design.layers[0];

export const selectActiveImage = (state: EditorState): LoadedImage | null => {
  const id = state.design.layers[0].imageId;
  return id ? (state.images[id] ?? null) : null;
};

/** The uploaded background image, if the background is one. */
export const selectBackgroundImage = (
  state: EditorState,
): LoadedImage | null => {
  const { background } = state.design;
  if (background.kind !== "image" || background.source.type !== "upload")
    return null;
  return state.images[background.source.imageId] ?? null;
};

/**
 * The newest uploaded background still in memory: the current one, or one
 * from the undo history, so the user can go back to it after trying others.
 */
export const selectLastBackgroundUpload = (
  state: EditorState,
): LoadedImage | null => {
  const designs = [...state.past, state.design];
  for (let i = designs.length - 1; i >= 0; i -= 1) {
    const { background } = designs[i];
    if (background.kind !== "image" || background.source.type !== "upload")
      continue;
    const image = state.images[background.source.imageId];
    if (image) return image;
  }
  return null;
};

/** The selected annotation, if it is still in the design (undo can remove it). */
export const selectSelectedAnnotation = (
  state: EditorState,
): Annotation | null => {
  const id = state.selectedAnnotationId;
  return id
    ? (state.design.annotations.find((annotation) => annotation.id === id) ??
        null)
    : null;
};

export const selectCanUndo = (state: EditorState) => state.past.length > 0;
export const selectCanRedo = (state: EditorState) => state.future.length > 0;
