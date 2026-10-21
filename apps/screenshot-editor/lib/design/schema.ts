import { z } from "zod";
import {
  BLUR,
  BORDER_WIDTH,
  MAX_FRAME_TEXT,
  PADDING,
  RADIUS,
  ROTATION,
  SHOT_SCALE,
} from "./limits";
import { CUSTOM_SIZE, SIZE_PRESET_IDS } from "./sizes";

// The design document: everything needed to redraw a design, as plain JSON.
// Images are referenced by id; the decoded pixels live in the editor store.
// docs/screenshot-editor-m2-spec.md describes each field.

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, "Expected a #rrggbb colour");

export const gradientStopSchema = z.object({
  offset: z.number().min(0).max(1),
  color: hexColorSchema,
});

/** CSS angle semantics: 0 points up, 90 points right. */
const angleSchema = z.number().min(0).lt(360);

export const linearBackgroundSchema = z.object({
  kind: z.literal("linear"),
  presetId: z.string().nullable(),
  angle: angleSchema,
  stops: z.array(gradientStopSchema).min(2),
});

export const radialBackgroundSchema = z.object({
  kind: z.literal("radial"),
  presetId: z.string().nullable(),
  stops: z.array(gradientStopSchema).min(2),
});

export const backgroundSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("solid"), color: hexColorSchema }),
  linearBackgroundSchema,
  radialBackgroundSchema,
  z.object({
    kind: z.literal("image"),
    source: z.discriminatedUnion("type", [
      z.object({ type: z.literal("upload"), imageId: z.string().min(1) }),
      z.object({
        type: z.literal("wallpaper"),
        wallpaperId: z.string().min(1),
      }),
    ]),
  }),
  z.object({ kind: z.literal("fromImage"), angle: angleSchema }),
  z.object({ kind: z.literal("transparent") }),
]);

export const backgroundFxSchema = z.object({
  blur: z.number().min(BLUR.min).max(BLUR.max),
});

const sideSchema = z.number().int().min(CUSTOM_SIZE.min).max(CUSTOM_SIZE.max);

export const canvasSpecSchema = z.union([
  z.object({ preset: z.literal("auto") }),
  z.object({
    preset: z.enum(SIZE_PRESET_IDS),
    width: sideSchema,
    height: sideSchema,
  }),
  z.object({
    preset: z.literal("custom"),
    width: sideSchema,
    height: sideSchema,
  }),
]);

export const SHADOW_PRESET_IDS = [
  "none",
  "soft",
  "medium",
  "floating",
] as const;
export const shadowPresetIdSchema = z.enum(SHADOW_PRESET_IDS);

export const shadowSpecSchema = z.object({
  /** "custom" once any value was changed by hand. */
  // "hard" was a preset once; designs saved with it keep its values as custom.
  preset: z.union([
    shadowPresetIdSchema,
    z.literal("custom"),
    z.literal("hard").transform(() => "custom" as const),
  ]),
  offsetX: z.number(),
  offsetY: z.number(),
  blur: z.number().min(0),
  color: hexColorSchema,
  opacity: z.number().min(0).max(1),
});

export const FRAME_KINDS = [
  "none",
  "macos",
  "browser",
  "windows",
  "windows-browser",
  "minimal",
  "glass",
  "phone",
  "tablet",
  "laptop",
] as const;

export const frameSpecSchema = z.object({
  kind: z.enum(FRAME_KINDS),
  theme: z.enum(["light", "dark"]),
  title: z.string().max(MAX_FRAME_TEXT),
  url: z.string().max(MAX_FRAME_TEXT),
});

export const shotLayerSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("shot"),
  imageId: z.string().min(1).nullable(),
  padding: z.number().int().min(PADDING.min).max(PADDING.max),
  scale: z.number().min(SHOT_SCALE.min).max(SHOT_SCALE.max),
  position: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }),
  rotation: z.number().int().min(ROTATION.min).max(ROTATION.max),
  radius: z.number().min(RADIUS.min).max(RADIUS.max),
  shadow: shadowSpecSchema,
  border: z.object({
    width: z.number().min(BORDER_WIDTH.min).max(BORDER_WIDTH.max),
    color: hexColorSchema,
    opacity: z.number().min(0).max(1),
  }),
  frame: frameSpecSchema,
});

// Annotations drawn on the screenshot. Positions and sizes are in "image
// widths": 1 is the screenshot's width, so they follow it when it moves or
// is resized. x runs 0 to 1 across, y 0 to height / width down.

/** The only colours steps, shapes and arrows may use (the Oxford Brookes palette). */
export const ANNOTATION_COLORS = ["#424a52", "#d10373", "#f9c909"] as const;
export const annotationColorSchema = z.enum(ANNOTATION_COLORS);

/**
 * A "highlight" is a see-through rectangle with no border; a
 * "blur" box blurs the screenshot under it instead of drawing a shape, and a
 * "magnify" box shows the screenshot under it enlarged.
 */
export const SHAPE_KINDS = [
  "rect",
  "rounded",
  "circle",
  "highlight",
  "blur",
  "magnify",
] as const;
/** The shapes a magnifier can be. */
export const MAGNIFY_LENSES = ["circle", "rect", "rounded"] as const;
/** Arrow looks; the first is the default. */
export const ARROW_STYLES = [
  "solid",
  "bold",
  "halo",
  "dotted",
  "chevrons",
] as const;
/**
 * Line ends; the first is the default. A line is stored as an arrow whose
 * style is one of these, so it moves, stretches and bends the same way.
 */
export const LINE_ENDS = ["flat", "dot", "round", "bar"] as const;
export const MAX_STEP_NUMBER = 999;
/** How far a step can be resized, as a multiple of its standard size. */
export const MIN_STEP_SIZE = 0.5;
export const MAX_STEP_SIZE = 4;

const imageUnit = z.number().min(0).max(100);
/** Positions can be left of or above the screenshot, on the background. */
const imagePosition = z.number().min(-100).max(100);

export const stepAnnotationSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("step"),
  /** The circle's centre. */
  x: imagePosition,
  y: imagePosition,
  number: z.number().int().min(1).max(MAX_STEP_NUMBER),
  color: annotationColorSchema,
  /** Times the standard size. Designs saved before steps could be resized get 1. */
  size: z.number().min(MIN_STEP_SIZE).max(MAX_STEP_SIZE).default(1),
});

export const shapeAnnotationSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("shape"),
  shape: z.enum(SHAPE_KINDS),
  /** Top-left corner of the shape's box. A circle's box is square. */
  x: imagePosition,
  y: imagePosition,
  width: imageUnit.positive(),
  height: imageUnit.positive(),
  color: annotationColorSchema,
  /** Filled with the colour, or a transparent shape with a coloured border. */
  filled: z.boolean(),
  /** Whether a highlight has rounded corners. Other shapes have none. */
  rounded: z.boolean().optional(),
  /** How strongly a blur box blurs, 0 to 1. Other shapes have none. */
  intensity: z.number().min(0).max(1).optional(),
  /** How much a magnifier enlarges. Other shapes have none. */
  zoom: z.number().min(1).max(8).optional(),
  /** A magnifier's shape. Magnifiers saved before there were shapes are rounded. */
  lens: z.enum(MAGNIFY_LENSES).optional(),
  /**
   * The centre of the area an inset magnifier enlarges. Without it a
   * magnifier enlarges what is under its own centre.
   */
  from: z.object({ x: imagePosition, y: imagePosition }).optional(),
});

export const arrowAnnotationSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("arrow"),
  /** The tail. */
  x: imagePosition,
  y: imagePosition,
  /** From the tail to the tip of the head. */
  dx: z.number().min(-200).max(200),
  dy: z.number().min(-200).max(200),
  color: annotationColorSchema,
  /**
   * A head, or a line end for lines. Arrows saved before there were styles
   * get the default; the retired tapered and classic styles become solid,
   * and the retired open style becomes bold.
   */
  style: z.preprocess(
    (style) =>
      style === "tapered" || style === "refined"
        ? "solid"
        : style === "chevron"
          ? "bold"
          : style,
    z.enum([...ARROW_STYLES, ...LINE_ENDS]).default("solid"),
  ),
  /** How far the middle is pulled to the left of straight, as a share of the length. */
  bend: z.number().min(-0.5).max(0.5).default(0),
});

export const annotationSchema = z.discriminatedUnion("kind", [
  stepAnnotationSchema,
  shapeAnnotationSchema,
  arrowAnnotationSchema,
]);

export const designSchema = z.object({
  version: z.literal(2),
  canvas: canvasSpecSchema,
  background: backgroundSchema,
  backgroundFx: backgroundFxSchema,
  // Exactly one screenshot layer until later milestones add more kinds.
  layers: z.tuple([shotLayerSchema]),
  // Designs saved before annotations existed get none.
  annotations: z.array(annotationSchema).max(500).default([]),
  /** The number the next step gets. */
  nextStep: z.number().int().min(1).max(MAX_STEP_NUMBER).default(1),
});

/** The milestone 1 design, kept so older saved designs can be migrated. */
export const designV1Schema = z.object({
  version: z.literal(1),
  canvas: z.object({ preset: z.literal("auto") }),
  background: linearBackgroundSchema,
  layers: z.tuple([
    z.object({
      id: z.string().min(1),
      kind: z.literal("shot"),
      imageId: z.string().min(1).nullable(),
      padding: z.number().int().min(PADDING.min).max(PADDING.max),
      radius: z.number().min(RADIUS.min).max(RADIUS.max),
      shadow: shadowSpecSchema.extend({ preset: shadowPresetIdSchema }),
    }),
  ]),
});

export type GradientStop = z.infer<typeof gradientStopSchema>;
export type LinearBackground = z.infer<typeof linearBackgroundSchema>;
export type RadialBackground = z.infer<typeof radialBackgroundSchema>;
export type Background = z.infer<typeof backgroundSchema>;
export type BackgroundKind = Background["kind"];
export type BackgroundFx = z.infer<typeof backgroundFxSchema>;
export type CanvasSpec = z.infer<typeof canvasSpecSchema>;
export type ShadowPresetId = z.infer<typeof shadowPresetIdSchema>;
export type ShadowSpec = z.infer<typeof shadowSpecSchema>;
export type FrameKind = (typeof FRAME_KINDS)[number];
export type FrameSpec = z.infer<typeof frameSpecSchema>;
export type ShotLayer = z.infer<typeof shotLayerSchema>;
export type ShotStyle = Omit<ShotLayer, "id" | "kind" | "imageId">;
export type AnnotationColor = (typeof ANNOTATION_COLORS)[number];
export type ShapeKind = (typeof SHAPE_KINDS)[number];
export type MagnifyLens = (typeof MAGNIFY_LENSES)[number];
export type StepAnnotation = z.infer<typeof stepAnnotationSchema>;
export type ShapeAnnotation = z.infer<typeof shapeAnnotationSchema>;
export type ArrowStyle = (typeof ARROW_STYLES)[number];
export type LineEnd = (typeof LINE_ENDS)[number];
export const isLineEnd = (style: string): style is LineEnd =>
  (LINE_ENDS as readonly string[]).includes(style);
export type ArrowAnnotation = z.infer<typeof arrowAnnotationSchema>;
export type Annotation = z.infer<typeof annotationSchema>;
export type Design = z.infer<typeof designSchema>;
export type DesignV1 = z.infer<typeof designV1Schema>;
