import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  Ellipse,
  Group,
  Image as KonvaImage,
  Line,
  Rect,
  Shape,
  Text,
  Transformer,
} from "react-konva";
import { create } from "zustand";
import {
  annotationWeight,
  clampStepSize,
  clampToArea,
  clickArrow,
  clickBox,
  MAX_STEP_SIZE,
  MIN_STEP_SIZE,
  dragBox,
  fitArrow,
  fitBox,
  inArea,
  isDrag,
  isSquareShape,
  snapEnd,
  SHAPE_CORNER,
  HIGHLIGHT_FILL_OPACITY,
  SHAPE_STROKE,
  STEP_RADIUS,
  stepTextColor,
  type Box,
  type Point,
} from "@/lib/design/annotations";
import {
  arrowCurve,
  arrowShape,
  bendToward,
  paintArrow,
} from "@/lib/design/arrowShape";
import { blurArea, DEFAULT_BLUR_INTENSITY } from "@/lib/design/blur";
import { hexToRgba } from "@/lib/design/colors";
import {
  DEFAULT_MAGNIFY_LENS,
  DEFAULT_MAGNIFY_ZOOM,
  insetConnector,
  MAGNIFY_BORDER,
  MAGNIFY_BORDER_COLOR,
  magnifyArea,
} from "@/lib/design/magnify";
import { insetBox, type Rect as LayoutRect } from "@/lib/design/layout";
import {
  type AlignGuides,
  alignBox,
  arrowEndNear,
  SNAP_DISTANCE,
  snapMove,
  snapPoint,
  snapTargets,
} from "@/lib/design/snap";
import type {
  Annotation,
  AnnotationColor,
  ArrowAnnotation,
  ArrowStyle,
  LineEnd,
  MagnifyLens,
  ScreenshotAnnotation,
  ShapeAnnotation,
  ShapeKind,
  StepAnnotation,
} from "@/lib/design/schema";
import { EXPORT_HIDDEN } from "@/lib/export/exportImage";
import { shownImage } from "@/lib/image/crop";
import { ANNOTATIONS_ROOT } from "@/lib/render/cropPicture";
import { CANVAS_FOCUS_ATTRIBUTE } from "@/lib/hooks/useShortcuts";
import type { LoadedImage } from "@/lib/image/load";
import { blurredPatch } from "@/lib/render/blurPatch";
import { FRAME_FONT_FAMILY } from "@/lib/render/frame";
import { useEditorStore } from "@/lib/store/editor";
import { clamp } from "@/lib/utils";
import { useFrameFont } from "./Chrome";
import { DeviceNode } from "./Device";
import { FramedShot, shadowProps } from "./FramedShot";
import { GUIDE_COLOR } from "./Guides";

/** Marks annotation nodes, so a press on one picks it up instead of drawing. */
const ANNOTATION_NAME = "annotation";
/** A second screenshot: with a drawing tool on, it's drawn on like the main one. */
const SCREENSHOT_NAME = "second-screenshot";

const SELECTION_COLOR = "#0a84ff";

/** Screen px: a step, an outline's border or an arrow can be pressed this far out. */
const MIN_HIT = 12;
/** Screen px: the radius of the handles on a selected arrow's ends and middle. */
const END_HANDLE = 5;

/** Where the selected annotation is on screen, in stage px. Not part of the design. */
export type SelectionFrame = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Read by the delete button over the canvas. Null while nothing is selected or it is moving. */
export const useSelectionFrame = create<{ frame: SelectionFrame | null }>()(
  () => ({ frame: null }),
);

/**
 * The arrow under the mouse, for the style menu below it. It lingers a moment
 * after the mouse leaves, so the menu can be reached.
 */
export const useArrowHover = create<{ frame: SelectionFrame | null }>()(() => ({
  frame: null,
}));
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
// The mouse is over the menu. Safari can report leaving the arrow after
// entering the menu, so leaving the arrow then must not hide it.
let overMenu = false;
export function keepArrowHover() {
  clearTimeout(hoverTimer);
}
/** The mouse entered (true) or left (false) the style menu. */
export function setOverArrowMenu(over: boolean) {
  overMenu = over;
  if (over) keepArrowHover();
  else endArrowHover();
}
export function endArrowHover(delay = 300) {
  clearTimeout(hoverTimer);
  if (delay === 0) {
    overMenu = false;
    useArrowHover.setState({ frame: null });
  } else
    hoverTimer = setTimeout(() => {
      if (!overMenu) useArrowHover.setState({ frame: null });
    }, delay);
}

function setFrame(frame: SelectionFrame | null) {
  const current = useSelectionFrame.getState().frame;
  const same =
    current === frame ||
    (current &&
      frame &&
      current.id === frame.id &&
      (["x", "y", "width", "height"] as const).every(
        (key) => Math.abs(current[key] - frame[key]) < 0.5,
      ));
  if (!same) useSelectionFrame.setState({ frame });
}

type Props = {
  /** The screenshot, relative to the shot. Annotations are placed from it. */
  image: LayoutRect;
  /** The whole shot, frame or device included, in canvas px. */
  outline: { width: number; height: number };
  /** The screenshot's pixels, which blur boxes blur. */
  source: LoadedImage;
  /** Where annotations can go (the whole canvas), in image widths. */
  area: Box;
  /** On-screen zoom of the stage, for sizes kept in screen pixels. */
  zoom: number;
  /** Whether the shot itself can be dragged (with the select tool). */
  shotDraggable: boolean;
};

function setCursor(node: Konva.Node | null, cursor: string) {
  const container = node?.getStage()?.container();
  if (container) container.style.cursor = cursor;
}

function StepNode({
  step,
  weight,
  zoom,
}: {
  step: StepAnnotation;
  weight: number;
  zoom: number;
}) {
  const radius = STEP_RADIUS * step.size * weight;
  // Small steps (zoomed out, on a phone) are still easy to press.
  const hitRadius = Math.max(radius, MIN_HIT / zoom);
  const digits = String(step.number).length;
  const fontSize = radius * (digits >= 3 ? 0.78 : digits === 2 ? 0.98 : 1.12);
  return (
    <>
      <Circle
        radius={radius}
        fill={step.color}
        shadowColor="#000000"
        shadowOpacity={0.28}
        shadowBlur={radius * 0.8}
        shadowOffsetY={radius * 0.2}
        hitFunc={(context, shape) => {
          context.beginPath();
          context.arc(0, 0, hitRadius, 0, Math.PI * 2, false);
          context.closePath();
          context.fillStrokeShape(shape);
        }}
      />
      <Text
        text={String(step.number)}
        x={-radius}
        y={-radius}
        width={2 * radius}
        height={2 * radius}
        align="center"
        verticalAlign="middle"
        fontSize={fontSize}
        fontFamily={FRAME_FONT_FAMILY}
        fontStyle="700"
        fill={stepTextColor(step.color)}
        listening={false}
      />
    </>
  );
}

const cornerRadius = (
  shape: Pick<ShapeAnnotation, "shape" | "rounded" | "lens">,
  width: number,
  height: number,
  weight: number,
) =>
  shape.shape === "rounded" ||
  (shape.shape === "highlight" && shape.rounded) ||
  (shape.shape === "magnify" &&
    (shape.lens ?? DEFAULT_MAGNIFY_LENS) === "rounded")
    ? Math.min(SHAPE_CORNER * weight, width / 2, height / 2)
    : 0;

/** A shape drawn from its box's top-left corner. */
function ShapeBody({
  shape,
  width,
  height,
  weight,
  zoom,
  borderOnly = false,
}: {
  shape: Pick<ShapeAnnotation, "shape" | "color" | "filled" | "rounded">;
  width: number;
  height: number;
  weight: number;
  zoom: number;
  /** An outline is pressed only by its border, so steps and shapes can go inside. */
  borderOnly?: boolean;
}) {
  if (shape.shape === "blur" || shape.shape === "magnify")
    // While being drawn: just where the blur or magnifier will go.
    return (
      <Rect
        width={width}
        height={height}
        fill="rgba(10, 132, 255, 0.08)"
        stroke={SELECTION_COLOR}
        strokeWidth={1.5 / zoom}
        dash={[4 / zoom, 3 / zoom]}
      />
    );
  const strokeWidth = SHAPE_STROKE * weight;
  const paint =
    shape.shape === "highlight"
      ? // A see-through fill, no border.
        { fill: hexToRgba(shape.color, HIGHLIGHT_FILL_OPACITY) }
      : shape.filled
        ? { fill: shape.color }
        : {
            stroke: shape.color,
            strokeWidth,
            hitStrokeWidth: Math.max(strokeWidth, MIN_HIT / zoom),
            // Transparent, but pressable inside to pick it up.
            fill: "rgba(0, 0, 0, 0)",
            fillEnabled: !borderOnly,
          };
  if (shape.shape === "circle")
    return (
      <Ellipse
        x={width / 2}
        y={height / 2}
        radiusX={width / 2}
        radiusY={height / 2}
        {...paint}
      />
    );
  return (
    <Rect
      width={width}
      height={height}
      cornerRadius={cornerRadius(shape, width, height, weight)}
      {...paint}
    />
  );
}

/** A second screenshot, in canvas px, and the frame it's drawn in. */
function useInset(annotation: ScreenshotAnnotation, unit: number) {
  const original = useEditorStore((state) => state.images[annotation.imageId]);
  const shot = useEditorStore((state) => state.design.layers[0]);
  if (!original) return null;
  const image = shownImage(original, annotation.crop);
  return {
    image,
    shot,
    frame: {
      ...shot.frame,
      kind: annotation.frame,
      title: annotation.title,
      url: annotation.url,
    },
    box: insetBox(
      image,
      annotation.frame,
      annotation.width * unit,
      shot.radius,
    ),
  };
}

/**
 * A second screenshot, with the main one's shadow, border and corners. Its
 * first child is the box itself (pressable all over), which a resize scales.
 */
function ScreenshotBody({
  annotation,
  unit,
}: {
  annotation: ScreenshotAnnotation;
  unit: number;
}) {
  const inset = useInset(annotation, unit);
  return (
    <>
      <Rect
        width={annotation.width * unit}
        height={annotation.height * unit}
        fill="rgba(0, 0, 0, 0)"
      />
      {inset && (
        <Group listening={false}>
          {inset.box.device ? (
            <DeviceNode
              device={inset.box.device}
              shadow={shadowProps(inset.shot.shadow)}
              listening={false}
            >
              <KonvaImage
                image={inset.image.source}
                x={inset.box.image.x}
                y={inset.box.image.y}
                width={inset.box.image.width}
                height={inset.box.image.height}
                cornerRadius={inset.box.imageRadii}
                listening={false}
              />
            </DeviceNode>
          ) : (
            <FramedShot
              image={inset.image}
              box={inset.box}
              frame={inset.frame}
              shadow={inset.shot.shadow}
              border={inset.shot.border}
              listening={false}
            />
          )}
        </Group>
      )}
    </>
  );
}

/** A screenshot's pixels and where they are, in image widths. */
type Picture = {
  source: LoadedImage;
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * The pictures blur boxes and magnifiers can work on: the second
 * screenshot's (inside its frame), then the main one's.
 */
function usePictures(
  annotations: readonly Annotation[],
  main: LoadedImage,
  unit: number,
): Picture[] {
  const images = useEditorStore((state) => state.images);
  const shot = useEditorStore((state) => state.design.layers[0]);
  const pictures: Picture[] = [];
  for (const annotation of [...annotations].reverse()) {
    if (annotation.kind !== "screenshot") continue;
    const original = images[annotation.imageId];
    if (!original) continue;
    const image = shownImage(original, annotation.crop);
    const box = insetBox(
      image,
      annotation.frame,
      annotation.width * unit,
      shot.radius,
    );
    pictures.push({
      source: image,
      x: annotation.x + box.image.x / unit,
      y: annotation.y + box.image.y / unit,
      width: box.image.width / unit,
      height: box.image.height / unit,
    });
  }
  pictures.push({
    source: main,
    x: 0,
    y: 0,
    width: 1,
    height: main.height / main.width,
  });
  return pictures;
}

/** The picture `point` is over: a second screenshot, else the main one. */
function pictureAt(pictures: readonly Picture[], point: Point): Picture {
  return (
    pictures
      .slice(0, -1)
      .find(
        (picture) =>
          point.x >= picture.x &&
          point.y >= picture.y &&
          point.x <= picture.x + picture.width &&
          point.y <= picture.y + picture.height,
      ) ?? pictures[pictures.length - 1]
  );
}

/** A point in image widths, in a picture's own widths. */
const toPicture = (point: Point, picture: Picture): Point => ({
  x: (point.x - picture.x) / picture.width,
  y: (point.y - picture.y) / picture.width,
});

/**
 * A shape in the widths of the picture it works on: for a blur box the one
 * its centre is over, for a magnifier the one under what it enlarges.
 */
function onPicture(
  shape: ShapeAnnotation,
  pictures: readonly Picture[],
  unit: number,
) {
  const centre = {
    x: shape.x + shape.width / 2,
    y: shape.y + shape.height / 2,
  };
  const picture = pictureAt(pictures, shape.from ?? centre);
  return {
    picture,
    source: picture.source,
    shape: {
      ...shape,
      ...toPicture(shape, picture),
      width: shape.width / picture.width,
      height: shape.height / picture.width,
      ...(shape.from && { from: toPicture(shape.from, picture) }),
    },
    aspect: picture.height / picture.width,
    unit: unit * picture.width,
  };
}

/**
 * The part of the screenshots an inset magnifier enlarges, in image widths:
 * on whichever picture its `from` is over.
 */
function insetArea(shape: ShapeAnnotation, pictures: readonly Picture[]) {
  const on = onPicture(shape, pictures, 1);
  const area = magnifyArea(
    on.shape,
    shape.zoom ?? DEFAULT_MAGNIFY_ZOOM,
    on.aspect,
    on.shape.from,
  );
  return {
    picture: on.picture,
    area: {
      x: on.picture.x + area.x * on.picture.width,
      y: on.picture.y + area.y * on.picture.width,
      width: area.width * on.picture.width,
      height: area.height * on.picture.width,
    },
  };
}

/** A blur box over whichever screenshot is under it. */
function BlurOver({
  shape,
  pictures,
  unit,
  zoom,
}: {
  shape: ShapeAnnotation;
  pictures: readonly Picture[];
  unit: number;
  zoom: number;
}) {
  const over = onPicture(shape, pictures, unit);
  return (
    <BlurBody
      shape={over.shape}
      source={over.source}
      aspect={over.aspect}
      unit={over.unit}
      zoom={zoom}
    />
  );
}

/**
 * A blur box: the screenshot under it, blurred. Its first child is the box
 * itself (pressable all over), which a resize stretches.
 */
function BlurBody({
  shape,
  source,
  aspect,
  unit,
  zoom,
}: {
  shape: ShapeAnnotation;
  source: LoadedImage;
  /** The screenshot's height over its width. */
  aspect: number;
  unit: number;
  zoom: number;
}) {
  const { x, y, width, height } = shape;
  const intensity = shape.intensity ?? DEFAULT_BLUR_INTENSITY;
  const area = useMemo(
    () => blurArea({ x, y, width, height }, aspect),
    [x, y, width, height, aspect],
  );
  const patch = useMemo(
    () =>
      area &&
      blurredPatch(
        source.source,
        source.source instanceof HTMLImageElement
          ? source.source.naturalWidth
          : source.source.width,
        source.source instanceof HTMLImageElement
          ? source.source.naturalHeight
          : source.source.height,
        area,
        intensity,
      ),
    [source, area, intensity],
  );
  useEffect(
    () => () => {
      if (patch) Konva.Util.releaseCanvas(patch);
    },
    [patch],
  );
  return (
    <>
      <Rect
        width={width * unit}
        height={height * unit}
        fill="rgba(0, 0, 0, 0)"
      />
      {area && patch ? (
        <KonvaImage
          image={patch}
          x={(area.x - x) * unit}
          y={(area.y - y) * unit}
          width={area.width * unit}
          height={area.height * unit}
          listening={false}
        />
      ) : (
        // Off the screenshot there is nothing to blur: show where it is.
        <Rect
          name={EXPORT_HIDDEN}
          width={width * unit}
          height={height * unit}
          stroke={SELECTION_COLOR}
          strokeWidth={1 / zoom}
          dash={[4 / zoom, 3 / zoom]}
          listening={false}
        />
      )}
    </>
  );
}

/** Traces a magnifier's outline in a box from (0, 0). */
function traceLens(
  context: { beginPath(): void; closePath(): void } & Pick<
    CanvasRenderingContext2D,
    "ellipse" | "roundRect"
  >,
  lens: MagnifyLens,
  width: number,
  height: number,
  corner: number,
) {
  context.beginPath();
  if (lens === "circle")
    context.ellipse(
      width / 2,
      height / 2,
      width / 2,
      height / 2,
      0,
      0,
      Math.PI * 2,
    );
  else context.roundRect(0, 0, width, height, lens === "rounded" ? corner : 0);
  context.closePath();
}

/** A magnifier's outline from its box's top-left corner, as a Konva shape. */
function LensOutline({
  lens,
  width,
  height,
  corner,
  ...paint
}: {
  lens: MagnifyLens;
  width: number;
  height: number;
  corner: number;
} & Konva.ShapeConfig) {
  return lens === "circle" ? (
    <Ellipse
      x={width / 2}
      y={height / 2}
      radiusX={width / 2}
      radiusY={height / 2}
      {...paint}
    />
  ) : (
    <Rect
      width={width}
      height={height}
      cornerRadius={lens === "rounded" ? corner : 0}
      {...paint}
    />
  );
}

/** A magnifier over whichever screenshot is under what it enlarges. */
function MagnifyOver({
  shape,
  pictures,
  unit,
  weight,
}: {
  shape: ShapeAnnotation;
  pictures: readonly Picture[];
  unit: number;
  weight: number;
}) {
  const over = onPicture(shape, pictures, unit);
  return (
    <MagnifyBody
      shape={over.shape}
      source={over.source}
      aspect={over.aspect}
      unit={over.unit}
      weight={weight}
    />
  );
}

/**
 * A magnifier: part of the screenshot, enlarged, in a grey frame with a
 * soft shadow. Its first child is the box itself (pressable all over), which
 * a resize stretches.
 */
function MagnifyBody({
  shape,
  source,
  aspect,
  unit,
  weight,
}: {
  shape: ShapeAnnotation;
  source: LoadedImage;
  /** The screenshot's height over its width. */
  aspect: number;
  unit: number;
  weight: number;
}) {
  const width = shape.width * unit;
  const height = shape.height * unit;
  const lens = shape.lens ?? DEFAULT_MAGNIFY_LENS;
  const area = magnifyArea(
    shape,
    shape.zoom ?? DEFAULT_MAGNIFY_ZOOM,
    aspect,
    shape.from,
  );
  // Source pixels per image width.
  const perUnit =
    source.source instanceof HTMLImageElement
      ? source.source.naturalWidth
      : source.source.width;
  // The same corner a resize gives the box (see placeShape).
  const corner = cornerRadius(shape, width, height, weight);
  const border = Math.min(MAGNIFY_BORDER * weight, width / 8, height / 8);
  return (
    <>
      <LensOutline
        lens={lens}
        width={width}
        height={height}
        corner={corner}
        fill="#ffffff"
        shadowColor="#000000"
        shadowOpacity={0.3}
        shadowBlur={0.02 * weight}
        shadowOffsetY={0.005 * weight}
      />
      <Group
        listening={false}
        clipFunc={(context) => traceLens(context, lens, width, height, corner)}
      >
        <KonvaImage
          image={source.source}
          width={width}
          height={height}
          crop={{
            x: area.x * perUnit,
            y: area.y * perUnit,
            width: area.width * perUnit,
            height: area.height * perUnit,
          }}
        />
      </Group>
      <LensOutline
        lens={lens}
        width={width}
        height={height}
        corner={corner}
        stroke={MAGNIFY_BORDER_COLOR}
        strokeWidth={border}
        listening={false}
      />
    </>
  );
}

/**
 * Where an inset magnifier looks: an outline round the area it enlarges,
 * and a line from there to the magnifier. Drawn under the magnifiers.
 */
function InsetSource({
  shape,
  pictures,
  unit,
  weight,
  zoom,
  ...groupProps
}: {
  shape: ShapeAnnotation;
  pictures: readonly Picture[];
  unit: number;
  weight: number;
  zoom: number;
} & Konva.ContainerConfig) {
  const lens = shape.lens ?? DEFAULT_MAGNIFY_LENS;
  const { area } = insetArea(shape, pictures);
  const line = insetConnector(area, shape, lens);
  const width = area.width * unit;
  const height = area.height * unit;
  const corner = Math.min(
    (SHAPE_CORNER * weight) / (shape.zoom ?? DEFAULT_MAGNIFY_ZOOM),
    width / 2,
    height / 2,
  );
  const border = Math.min(MAGNIFY_BORDER * weight, width / 6, height / 6);
  return (
    <>
      {line && (
        <Line
          points={line.flatMap((point) => [point.x * unit, point.y * unit])}
          stroke={MAGNIFY_BORDER_COLOR}
          strokeWidth={border * 0.6}
          lineCap="round"
          listening={false}
        />
      )}
      <Group
        name={ANNOTATION_NAME}
        x={area.x * unit}
        y={area.y * unit}
        {...groupProps}
      >
        <LensOutline
          lens={lens}
          width={width}
          height={height}
          corner={corner}
          stroke={MAGNIFY_BORDER_COLOR}
          strokeWidth={border}
          hitStrokeWidth={Math.max(border, MIN_HIT / zoom)}
          // Transparent, but pressable inside to move it.
          fill="rgba(0, 0, 0, 0)"
        />
      </Group>
    </>
  );
}

/** An arrow drawn from its tail, `delta` px to its tip, in one of the styles. */
function ArrowBody({
  delta,
  style,
  bend,
  color,
  weight,
  zoom,
}: {
  delta: Point;
  style: ArrowStyle | LineEnd;
  bend: number;
  color: AnnotationColor;
  weight: number;
  zoom: number;
}) {
  const { x: dx, y: dy } = delta;
  const shape = useMemo(
    () => arrowShape(style, { x: 0, y: 0 }, { x: dx, y: dy }, bend, weight),
    [style, dx, dy, bend, weight],
  );
  if (!shape) return null;
  const { bounds } = shape;
  // Thin arrows (zoomed out, on a phone) are still easy to press.
  const hitWidth = Math.max(
    shape.stroke?.width ?? 0.006 * weight,
    MIN_HIT / zoom,
  );
  return (
    <Shape
      // Its box is the arrow's, so the delete button and style menu sit by it.
      x={bounds.x}
      y={bounds.y}
      width={bounds.width}
      height={bounds.height}
      fill={color}
      stroke={color}
      strokeWidth={0.001}
      hitStrokeWidth={hitWidth}
      lineCap="round"
      lineJoin="round"
      sceneFunc={(context) => {
        const ctx = context._context;
        ctx.save();
        ctx.translate(-bounds.x, -bounds.y);
        paintArrow(ctx, shape, color);
        ctx.restore();
      }}
      hitFunc={(context, node) => {
        context.translate(-bounds.x, -bounds.y);
        context.beginPath();
        shape.spine.forEach((p, i) =>
          i === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y),
        );
        context.strokeShape(node);
        context.beginPath();
        shape.head.forEach((p, i) =>
          i === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y),
        );
        context.closePath();
        context.fillShape(node);
        context.strokeShape(node);
      }}
    />
  );
}

/** The size of a shape annotation's node, in canvas px. */
function shapeSize(group: Konva.Group) {
  const body = group.getChildren()[0];
  if (body instanceof Konva.Ellipse)
    return { width: 2 * body.radiusX(), height: 2 * body.radiusY() };
  return { width: body?.width() ?? 0, height: body?.height() ?? 0 };
}

/** Puts a shape annotation's node at a box in canvas px, unstretched. */
function placeShape(
  group: Konva.Group,
  box: Box,
  shape: Pick<ShapeAnnotation, "shape" | "rounded" | "lens">,
  weight: number,
) {
  group.setAttrs({ x: box.x, y: box.y, scaleX: 1, scaleY: 1 });
  const body = group.getChildren()[0];
  const { width, height } = box;
  if (body instanceof Konva.Ellipse)
    body.setAttrs({
      x: width / 2,
      y: height / 2,
      radiusX: width / 2,
      radiusY: height / 2,
    });
  else
    body?.setAttrs({
      width,
      height,
      cornerRadius: cornerRadius(shape, width, height, weight),
    });
}

/** Steps, shapes and arrows over the screenshot, and the tools that add and edit them. */
export function AnnotationsNode({
  image,
  outline,
  source,
  area,
  zoom,
  shotDraggable,
}: Props) {
  const annotations = useEditorStore((state) => state.design.annotations);
  const tool = useEditorStore((state) => state.annotationTool);
  const selectedId = useEditorStore((state) => state.selectedAnnotationId);
  const color = useEditorStore((state) => state.annotationColor);
  const filled = useEditorStore((state) => state.shapeFilled);
  const highlightRounded = useEditorStore((state) => state.highlightRounded);
  const arrowStyle = useEditorStore((state) => state.arrowStyle);
  const lineEnd = useEditorStore((state) => state.lineEnd);
  const magnifyLens = useEditorStore((state) => state.magnifyLens);
  const fontReady = useFrameFont();
  const rootRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodes = useRef(new Map<string, Konva.Group>());
  // While the selection is dragged or resized, its delete button hides.
  const moving = useRef(false);
  const hovered = useRef<Konva.Node | null>(null);
  const [draft, setDraft] = useState<Box | null>(null);
  /** The point a dragged annotation has snapped to, marked while it holds. */
  const [snapGuide, setSnapGuide] = useState<Point | null>(null);
  /** The lines a dragged second screenshot lined up on, while it holds. */
  const [alignGuides, setAlignGuides] = useState<AlignGuides | null>(null);
  const [arrowDraft, setArrowDraft] = useState<{
    start: Point;
    end: Point;
  } | null>(null);

  // Lengths are in image widths; this turns them into canvas px.
  const unit = image.width;
  // The main screenshot's whole outline, which a second one lines up with.
  const shotBox: Box = {
    x: -image.x / unit,
    y: -image.y / unit,
    width: outline.width / unit,
    height: outline.height / unit,
  };
  // Sizes (lines, steps, corners) follow the longer side instead, so a
  // portrait screenshot's annotations are as heavy as a landscape one's.
  const weight = unit * annotationWeight(image.height / image.width);
  const selecting = tool === "select";
  // Any tool can pick up, move and delete an annotation.
  const selected =
    annotations.find((annotation) => annotation.id === selectedId) ?? null;
  // The cursor away from annotations.
  const restCursor = selecting ? (shotDraggable ? "grab" : "") : "crosshair";

  // Pressing the canvas away from every annotation clears the selection, and
  // with a drawing tool adds a step or starts a shape.
  useEffect(() => {
    const root = rootRef.current;
    const stage = root?.getStage();
    if (!root || !stage) return;
    const store = useEditorStore.getState;
    const pointer = (): Point | null => {
      const position = root.getRelativePointerPosition();
      return position ? { x: position.x / unit, y: position.y / unit } : null;
    };
    let start: Point | null = null;
    let end: Point | null = null;
    // Round magnifiers are drawn square, like circles.
    const boxKind = (kind: ShapeKind): ShapeKind =>
      kind === "magnify" && magnifyLens === "circle" ? "circle" : kind;
    // Arrows and lines keep to 45 degree steps while Shift is held.
    const lineEnd = (from: Point, to: Point, shift: boolean) =>
      shift ? snapEnd(from, to, area) : clampToArea(to, area);

    const finish = (event: PointerEvent) => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      if (!start || tool === "select" || tool === "step") return;
      if (tool === "arrow" || tool === "line") {
        const arrow =
          end && isDrag(start, end)
            ? { start, end: lineEnd(start, end, event.shiftKey) }
            : clickArrow(start, area);
        start = end = null;
        setArrowDraft(null);
        store().addArrow(arrow.start, arrow.end, tool === "line");
        return;
      }
      const box =
        end && isDrag(start, end)
          ? dragBox(start, end, boxKind(tool), area)
          : clickBox(start, boxKind(tool), area);
      start = end = null;
      setDraft(null);
      store().addShape(tool, box);
    };
    const cancel = () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      start = end = null;
      setDraft(null);
      setArrowDraft(null);
    };

    const onDown = (event: KonvaEventObject<PointerEvent>) => {
      // Konva keeps the focus where it was (often a toolbar button); move it
      // to the canvas so Delete, Escape and the arrow keys act here.
      const canvas = stage
        .container()
        .closest<HTMLElement>(`[${CANVAS_FOCUS_ATTRIBUTE}]`);
      canvas?.focus({ preventScroll: true });
      if (event.evt.button !== undefined && event.evt.button !== 0) return;
      // An annotation selects itself; the selection box resizes. With the
      // step tool, though, the end of an arrow or line takes a step centred
      // on it, so a step can be put at the end of a line.
      const target = event.target;
      const under = target.findAncestor(`.${ANNOTATION_NAME}`, true);
      const pressed =
        under && !(tool !== "select" && under.hasName(SCREENSHOT_NAME))
          ? under
          : null;
      if (tool === "step" && pressed && !event.evt.altKey) {
        const point = pointer();
        const end =
          point &&
          arrowEndNear(
            point,
            store().design.annotations,
            SNAP_DISTANCE / (unit * zoom),
          );
        if (end) {
          store().addStep(end);
          return;
        }
      }
      if (pressed || target.findAncestor("Transformer", true)) return;
      store().selectAnnotation(null);
      if (tool === "select") return;
      const point = pointer();
      if (!point || !inArea(point, area)) return;
      if (tool === "step") {
        // Centred on a key point of another annotation when near one.
        const target = event.evt.altKey
          ? null
          : snapPoint(
              point,
              store().design.annotations.flatMap(snapTargets),
              SNAP_DISTANCE / (unit * zoom),
            );
        store().addStep(target ?? point);
        return;
      }
      start = end = point;
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", cancel);
    };
    const onMove = (event: KonvaEventObject<PointerEvent>) => {
      if (!start || tool === "select" || tool === "step") return;
      end = pointer();
      if (!end || !isDrag(start, end)) return;
      if (tool === "arrow" || tool === "line")
        setArrowDraft({ start, end: lineEnd(start, end, event.evt.shiftKey) });
      else setDraft(dragBox(start, end, boxKind(tool), area));
    };

    stage.on("pointerdown.annotate", onDown);
    stage.on("pointermove.annotate", onMove);
    // What the pointer is over, so the cursor can be put back if it goes.
    stage.on("mouseover.annotate", (event) => {
      hovered.current = event.target;
    });
    setCursor(root, tool === "select" ? "" : "crosshair");
    return () => {
      stage.off("pointerdown.annotate");
      stage.off("pointermove.annotate");
      stage.off("mouseover.annotate");
      cancel();
      setCursor(root, "");
    };
  }, [tool, unit, zoom, area, magnifyLens]);

  // The selection box follows the selected annotation's node (a step's
  // node is replaced when the font loads).
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const node = selected ? nodes.current.get(selected.id) : undefined;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selected, fontReady]);

  // Deselected mid-resize (Escape, Delete, undo): the shape never hears the
  // resize end, so finish the gesture here.
  const selectedKey = selected?.id;
  useEffect(
    () => () => {
      if (!moving.current) return;
      moving.current = false;
      useEditorStore.getState().sealHistory();
    },
    [selectedKey],
  );

  /** Tells the delete button where the selection is now. */
  const showFrame = (id: string | undefined) => {
    const node = id ? nodes.current.get(id) : undefined;
    if (!id || !node || !node.getStage()) {
      setFrame(null);
      return;
    }
    const rect = node.getClientRect({ skipShadow: true });
    setFrame({ id, ...rect });
  };

  // After every render: the selection, the layout or the zoom may have changed.
  useLayoutEffect(() => {
    if (!moving.current) showFrame(selected?.id);
    // An annotation or handle removed from under the pointer (undo, Delete,
    // deselecting) never hears the pointer leave, so its "grab" or "move"
    // cursor would stay; put the tool's cursor back.
    const node = hovered.current;
    if (node && !node.getStage() && !moving.current) {
      hovered.current = null;
      setCursor(rootRef.current, restCursor);
    }
  });
  useEffect(() => () => setFrame(null), []);

  const register = (id: string) => (node: Konva.Group | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  };

  /** The points the annotation `id` can snap to: every other annotation's. */
  const targetsBesides = (id: string) =>
    annotations
      .filter((annotation) => annotation.id !== id)
      .flatMap(snapTargets);

  const startMoving = () => {
    moving.current = true;
    setFrame(null);
    useEditorStore.getState().beginGesture();
  };
  const stopMoving = (id: string) => {
    moving.current = false;
    useEditorStore.getState().sealHistory();
    showFrame(id);
  };

  const dragProps = (annotation: Annotation) => ({
    draggable: true,
    onPointerDown: (event: KonvaEventObject<PointerEvent>) => {
      if (event.evt.button !== undefined && event.evt.button !== 0) return;
      // The step tool puts a step on an arrow's end instead (see onDown).
      const position = rootRef.current?.getRelativePointerPosition();
      if (
        tool === "step" &&
        annotation.kind === "arrow" &&
        !event.evt.altKey &&
        position &&
        arrowEndNear(
          { x: position.x / unit, y: position.y / unit },
          annotations,
          SNAP_DISTANCE / (unit * zoom),
        )
      )
        return;
      useEditorStore.getState().selectAnnotation(annotation.id);
    },
    onDragStart: (event: KonvaEventObject<DragEvent>) => {
      // Not the shot's drag too.
      event.cancelBubble = true;
      useEditorStore.getState().selectAnnotation(annotation.id);
      startMoving();
      setCursor(event.target, "grabbing");
    },
    onDragMove: (event: KonvaEventObject<DragEvent>) => {
      event.cancelBubble = true;
      const node = event.target;
      // Near a key point of another annotation, it lands exactly on it,
      // unless Alt is held.
      const distance = SNAP_DISTANCE / (unit * zoom);
      const snapped = event.evt.altKey
        ? { position: { x: node.x() / unit, y: node.y() / unit }, target: null }
        : snapMove(
            annotation,
            { x: node.x() / unit, y: node.y() / unit },
            targetsBesides(annotation.id),
            distance,
          );
      // A second screenshot not on a point lines up with the main one:
      // level with it (tops, middles or bottoms), or centred across.
      const aligned =
        annotation.kind === "screenshot" && !event.evt.altKey && !snapped.target
          ? alignBox(annotation, snapped.position, shotBox, distance)
          : null;
      const at = aligned?.position ?? snapped.position;
      let to: Point;
      if (annotation.kind === "step") {
        to = clampToArea(at, area);
      } else if (annotation.kind === "arrow") {
        to = fitArrow(at, { x: annotation.dx, y: annotation.dy }, area);
      } else {
        const box = fitBox(
          {
            ...at,
            width: annotation.width,
            height: annotation.height,
          },
          area,
          annotation.kind === "shape" && isSquareShape(annotation),
        );
        to = { x: box.x, y: box.y };
      }
      // The guide only while the snap held (fitting may have moved it off).
      setSnapGuide(
        snapped.target && to.x === at.x && to.y === at.y
          ? snapped.target
          : null,
      );
      setAlignGuides(
        aligned && {
          x: to.x === at.x ? aligned.guides.x : [],
          y: to.y === at.y ? aligned.guides.y : [],
        },
      );
      // Kept on the screenshot even when the stored position doesn't change.
      node.position({ x: to.x * unit, y: to.y * unit });
      useEditorStore.getState().moveAnnotation(annotation.id, to);
    },
    onDragEnd: (event: KonvaEventObject<DragEvent>) => {
      event.cancelBubble = true;
      setSnapGuide(null);
      setAlignGuides(null);
      stopMoving(annotation.id);
      setCursor(event.target, "grab");
    },
    onMouseEnter: (event: KonvaEventObject<MouseEvent>) => {
      setCursor(event.target, "grab");
    },
    onMouseLeave: (event: KonvaEventObject<MouseEvent>) => {
      if (!moving.current) setCursor(event.target, restCursor);
    },
  });

  const transformProps = (shape: ShapeAnnotation) => ({
    onTransformStart: startMoving,
    // The stretch goes into the shape's size as it happens, so the border
    // keeps its width.
    onTransform: (event: KonvaEventObject<Event>) => {
      const node = event.currentTarget as Konva.Group;
      const size = shapeSize(node);
      placeShape(
        node,
        {
          x: node.x(),
          y: node.y(),
          width: size.width * node.scaleX(),
          height: size.height * node.scaleY(),
        },
        shape,
        weight,
      );
    },
    onTransformEnd: (event: KonvaEventObject<Event>) => {
      const node = event.currentTarget as Konva.Group;
      const size = shapeSize(node);
      const box = fitBox(
        {
          x: node.x() / unit,
          y: node.y() / unit,
          width: (size.width * node.scaleX()) / unit,
          height: (size.height * node.scaleY()) / unit,
        },
        area,
        isSquareShape(shape),
      );
      // Set here too: if the box ends where it began, nothing re-renders it.
      placeShape(
        node,
        {
          x: box.x * unit,
          y: box.y * unit,
          width: box.width * unit,
          height: box.height * unit,
        },
        shape,
        weight,
      );
      transformerRef.current?.forceUpdate();
      useEditorStore.getState().resizeShape(shape.id, box);
      stopMoving(shape.id);
    },
  });

  // A step is resized from a corner and stays round; the stretch becomes its
  // size when the resize ends.
  const stepTransformProps = (step: StepAnnotation) => ({
    onTransformStart: startMoving,
    onTransformEnd: (event: KonvaEventObject<Event>) => {
      const node = event.currentTarget as Konva.Group;
      const size = clampStepSize(step.size * node.scaleX());
      const centre = clampToArea(
        { x: node.x() / unit, y: node.y() / unit },
        area,
      );
      // Set here too: if nothing changes, nothing re-renders it.
      node.setAttrs({
        x: centre.x * unit,
        y: centre.y * unit,
        scaleX: 1,
        scaleY: 1,
      });
      transformerRef.current?.forceUpdate();
      useEditorStore.getState().resizeStep(step.id, centre, size);
      stopMoving(step.id);
    },
  });

  // A selected arrow's ends are dragged on their own.
  const endProps = (arrow: ArrowAnnotation, end: "start" | "end") => ({
    draggable: true,
    onDragStart: (event: KonvaEventObject<DragEvent>) => {
      event.cancelBubble = true;
      startMoving();
    },
    onDragMove: (event: KonvaEventObject<DragEvent>) => {
      event.cancelBubble = true;
      const node = event.target;
      const current = useEditorStore
        .getState()
        .design.annotations.find((item) => item.id === arrow.id);
      if (current?.kind !== "arrow") return;
      const tail = { x: current.x, y: current.y };
      const tip = { x: current.x + current.dx, y: current.y + current.dy };
      const pointer = { x: node.x() / unit, y: node.y() / unit };
      // With Shift, the end keeps to 45 degree steps around the other end;
      // otherwise it lands on a key point of another annotation near it,
      // unless Alt is held.
      const target =
        event.evt.shiftKey || event.evt.altKey
          ? null
          : snapPoint(
              pointer,
              targetsBesides(arrow.id),
              SNAP_DISTANCE / (unit * zoom),
            );
      const to = event.evt.shiftKey
        ? snapEnd(end === "start" ? tip : tail, pointer, area)
        : clampToArea(target ?? pointer, area);
      setSnapGuide(
        target && to.x === target.x && to.y === target.y ? target : null,
      );
      node.position({ x: to.x * unit, y: to.y * unit });
      const [from, onto] = end === "start" ? [to, tip] : [tail, to];
      useEditorStore.getState().setArrowEnds(arrow.id, from, onto);
    },
    onDragEnd: (event: KonvaEventObject<DragEvent>) => {
      event.cancelBubble = true;
      setSnapGuide(null);
      stopMoving(arrow.id);
    },
    onMouseEnter: (event: KonvaEventObject<MouseEvent>) => {
      setCursor(event.target, "move");
    },
    onMouseLeave: (event: KonvaEventObject<MouseEvent>) => {
      if (!moving.current) setCursor(event.target, restCursor);
    },
  });

  // Hovering an arrow shows its style menu (also shown while it's selected).
  const arrowHoverProps = (arrow: ArrowAnnotation) => ({
    onMouseEnter: (event: KonvaEventObject<MouseEvent>) => {
      setCursor(event.target, "grab");
      if (moving.current) return;
      keepArrowHover();
      const node = nodes.current.get(arrow.id);
      if (node)
        useArrowHover.setState({
          frame: { id: arrow.id, ...node.getClientRect({ skipShadow: true }) },
        });
    },
    onMouseLeave: (event: KonvaEventObject<MouseEvent>) => {
      if (!moving.current) setCursor(event.target, restCursor);
      endArrowHover();
    },
    onDragStart: (event: KonvaEventObject<DragEvent>) => {
      endArrowHover(0);
      dragProps(arrow).onDragStart(event);
    },
  });

  // The handle in a selected arrow's middle bends it to either side. It only
  // moves across the arrow, so the curve stays even from tail to tip.
  const bendProps = (arrow: ArrowAnnotation) => ({
    draggable: true,
    onDragStart: (event: KonvaEventObject<DragEvent>) => {
      event.cancelBubble = true;
      endArrowHover(0);
      startMoving();
    },
    onDragMove: (event: KonvaEventObject<DragEvent>) => {
      event.cancelBubble = true;
      const node = event.target;
      const current = useEditorStore
        .getState()
        .design.annotations.find((item) => item.id === arrow.id);
      if (current?.kind !== "arrow") return;
      const tail = { x: current.x * unit, y: current.y * unit };
      const tip = {
        x: (current.x + current.dx) * unit,
        y: (current.y + current.dy) * unit,
      };
      const bend = bendToward(tail, tip, node.position());
      node.position(arrowCurve(tail, tip, bend).handle);
      useEditorStore.getState().setArrowBend(arrow.id, bend);
    },
    onDragEnd: (event: KonvaEventObject<DragEvent>) => {
      event.cancelBubble = true;
      setSnapGuide(null);
      stopMoving(arrow.id);
    },
    onMouseEnter: (event: KonvaEventObject<MouseEvent>) => {
      setCursor(event.target, "move");
    },
    onMouseLeave: (event: KonvaEventObject<MouseEvent>) => {
      if (!moving.current) setCursor(event.target, restCursor);
    },
  });

  // Second screenshots go under everything drawn on them, insets' outlines
  // included.
  const screenshots = annotations.filter(
    (annotation) => annotation.kind === "screenshot",
  );
  const drawnOn = annotations.filter(
    (annotation) => annotation.kind !== "screenshot",
  );

  // A second screenshot is resized from its corners, keeping its shape; the
  // stretch becomes its width when the resize ends.
  const screenshotTransformProps = (shot: ScreenshotAnnotation) => ({
    onTransformStart: startMoving,
    onTransformEnd: (event: KonvaEventObject<Event>) => {
      const node = event.currentTarget as Konva.Group;
      const ratio = shot.height / shot.width;
      // No bigger than the canvas, and on it.
      const width = Math.min(
        shot.width * node.scaleX(),
        area.width,
        area.height / ratio,
      );
      const box = fitBox(
        {
          x: node.x() / unit,
          y: node.y() / unit,
          width,
          height: width * ratio,
        },
        area,
      );
      node.setAttrs({
        x: box.x * unit,
        y: box.y * unit,
        scaleX: 1,
        scaleY: 1,
      });
      useEditorStore
        .getState()
        .resizeScreenshot(shot.id, box.x, box.y, box.width);
      transformerRef.current?.forceUpdate();
      stopMoving(shot.id);
    },
  });

  const selectedShape = selected?.kind === "shape" ? selected : null;
  const selectedArrow = selected?.kind === "arrow" ? selected : null;
  // Steps and circles keep their proportions, from the corners.
  const roundSelection =
    selected?.kind === "step" ||
    selected?.kind === "screenshot" ||
    (selectedShape !== null && isSquareShape(selectedShape));

  const pictures = usePictures(annotations, source, unit);
  // An inset's outline round the area it enlarges is dragged on its own.
  const sourceProps = (shape: ShapeAnnotation) => ({
    draggable: true,
    onPointerDown: (event: KonvaEventObject<PointerEvent>) => {
      if (event.evt.button !== undefined && event.evt.button !== 0) return;
      useEditorStore.getState().selectAnnotation(shape.id);
    },
    onDragStart: (event: KonvaEventObject<DragEvent>) => {
      event.cancelBubble = true;
      useEditorStore.getState().selectAnnotation(shape.id);
      startMoving();
      setCursor(event.target, "grabbing");
    },
    onDragMove: (event: KonvaEventObject<DragEvent>) => {
      event.cancelBubble = true;
      const node = event.target;
      // Kept on the screenshot its centre is over, at that one's size.
      const { area } = insetArea(shape, pictures);
      const { area: over, picture } = insetArea(
        {
          ...shape,
          from: {
            x: node.x() / unit + area.width / 2,
            y: node.y() / unit + area.height / 2,
          },
        },
        pictures,
      );
      const { width, height } = over;
      const x = clamp(
        node.x() / unit,
        picture.x,
        picture.x + picture.width - width,
      );
      const y = clamp(
        node.y() / unit,
        picture.y,
        picture.y + picture.height - height,
      );
      node.position({ x: x * unit, y: y * unit });
      useEditorStore.getState().moveMagnifySource(shape.id, {
        x: x + width / 2,
        y: y + height / 2,
      });
    },
    onDragEnd: (event: KonvaEventObject<DragEvent>) => {
      event.cancelBubble = true;
      stopMoving(shape.id);
      setCursor(event.target, "grab");
    },
    onMouseEnter: (event: KonvaEventObject<MouseEvent>) => {
      setCursor(event.target, "grab");
    },
    onMouseLeave: (event: KonvaEventObject<MouseEvent>) => {
      if (!moving.current) setCursor(event.target, restCursor);
    },
  });

  const drawAnnotation = (annotation: Annotation) =>
    annotation.kind === "screenshot" ? (
      <Group
        key={annotation.id}
        ref={register(annotation.id)}
        name={`${ANNOTATION_NAME} ${SCREENSHOT_NAME}`}
        x={annotation.x * unit}
        y={annotation.y * unit}
        {...screenshotTransformProps(annotation)}
        // Moved with the select tool; drawn on with the others.
        {...(selecting ? dragProps(annotation) : {})}
      >
        <ScreenshotBody annotation={annotation} unit={unit} />
      </Group>
    ) : annotation.kind === "arrow" ? (
      <Group
        key={annotation.id}
        ref={register(annotation.id)}
        name={ANNOTATION_NAME}
        x={annotation.x * unit}
        y={annotation.y * unit}
        {...dragProps(annotation)}
        {...arrowHoverProps(annotation)}
      >
        <ArrowBody
          delta={{ x: annotation.dx * unit, y: annotation.dy * unit }}
          style={annotation.style}
          bend={annotation.bend}
          color={annotation.color}
          weight={weight}
          zoom={zoom}
        />
      </Group>
    ) : annotation.kind === "step" ? (
      <Group
        key={`${annotation.id}-${fontReady ? "font" : "fallback"}`}
        ref={register(annotation.id)}
        name={ANNOTATION_NAME}
        x={annotation.x * unit}
        y={annotation.y * unit}
        {...stepTransformProps(annotation)}
        {...dragProps(annotation)}
      >
        <StepNode step={annotation} weight={weight} zoom={zoom} />
      </Group>
    ) : (
      <Group
        key={annotation.id}
        ref={register(annotation.id)}
        name={ANNOTATION_NAME}
        x={annotation.x * unit}
        y={annotation.y * unit}
        {...transformProps(annotation)}
        {...dragProps(annotation)}
      >
        {annotation.shape === "blur" ? (
          <BlurOver
            shape={annotation}
            pictures={pictures}
            unit={unit}
            zoom={zoom}
          />
        ) : annotation.shape === "magnify" ? (
          <MagnifyOver
            shape={annotation}
            pictures={pictures}
            unit={unit}
            weight={weight}
          />
        ) : (
          <ShapeBody
            shape={annotation}
            width={annotation.width * unit}
            height={annotation.height * unit}
            weight={weight}
            zoom={zoom}
            borderOnly={!selecting}
          />
        )}
      </Group>
    );

  return (
    <Group ref={rootRef} name={ANNOTATIONS_ROOT} x={image.x} y={image.y}>
      {screenshots.map(drawAnnotation)}
      {annotations.map(
        (annotation) =>
          annotation.kind === "shape" &&
          annotation.shape === "magnify" &&
          annotation.from && (
            <InsetSource
              key={`${annotation.id}-from`}
              shape={annotation}
              pictures={pictures}
              unit={unit}
              weight={weight}
              zoom={zoom}
              {...sourceProps(annotation)}
            />
          ),
      )}
      {drawnOn.map(drawAnnotation)}
      {alignGuides && selected?.kind === "screenshot" && (
        // Across both screenshots, a little beyond them.
        <Group name={EXPORT_HIDDEN} listening={false}>
          {(() => {
            const over = 16 / zoom;
            const line = { stroke: GUIDE_COLOR, strokeWidth: 1 / zoom };
            const left = Math.min(shotBox.x, selected.x) * unit - over;
            const right =
              Math.max(shotBox.x + shotBox.width, selected.x + selected.width) *
                unit +
              over;
            const top = Math.min(shotBox.y, selected.y) * unit - over;
            const bottom =
              Math.max(
                shotBox.y + shotBox.height,
                selected.y + selected.height,
              ) *
                unit +
              over;
            return (
              <>
                {alignGuides.y.map((y) => (
                  <Line
                    key={`y${y}`}
                    points={[left, y * unit, right, y * unit]}
                    {...line}
                  />
                ))}
                {alignGuides.x.map((x) => (
                  <Line
                    key={`x${x}`}
                    points={[x * unit, top, x * unit, bottom]}
                    {...line}
                  />
                ))}
              </>
            );
          })()}
        </Group>
      )}
      {snapGuide && (
        // A ring and cross on the point it snapped to.
        <Group
          name={EXPORT_HIDDEN}
          x={snapGuide.x * unit}
          y={snapGuide.y * unit}
          listening={false}
        >
          <Circle
            radius={7 / zoom}
            stroke={SELECTION_COLOR}
            strokeWidth={1.5 / zoom}
          />
          <Line
            points={[-12 / zoom, 0, 12 / zoom, 0]}
            stroke={SELECTION_COLOR}
            strokeWidth={1 / zoom}
          />
          <Line
            points={[0, -12 / zoom, 0, 12 / zoom]}
            stroke={SELECTION_COLOR}
            strokeWidth={1 / zoom}
          />
        </Group>
      )}
      {draft && (
        <Group
          name={EXPORT_HIDDEN}
          x={draft.x * unit}
          y={draft.y * unit}
          opacity={0.75}
          listening={false}
        >
          <ShapeBody
            shape={{
              shape:
                tool === "rect" ||
                tool === "rounded" ||
                tool === "circle" ||
                tool === "highlight" ||
                tool === "blur" ||
                tool === "magnify"
                  ? tool
                  : "rect",
              color,
              filled,
              rounded: highlightRounded,
            }}
            width={draft.width * unit}
            height={draft.height * unit}
            weight={weight}
            zoom={zoom}
          />
        </Group>
      )}
      {arrowDraft && (
        <Group
          name={EXPORT_HIDDEN}
          x={arrowDraft.start.x * unit}
          y={arrowDraft.start.y * unit}
          opacity={0.75}
          listening={false}
        >
          <ArrowBody
            delta={{
              x: (arrowDraft.end.x - arrowDraft.start.x) * unit,
              y: (arrowDraft.end.y - arrowDraft.start.y) * unit,
            }}
            style={tool === "line" ? lineEnd : arrowStyle}
            bend={0}
            color={color}
            weight={weight}
            zoom={zoom}
          />
        </Group>
      )}
      {selectedArrow &&
        (["start", "end"] as const).map((end) => {
          const at =
            end === "start"
              ? { x: selectedArrow.x, y: selectedArrow.y }
              : {
                  x: selectedArrow.x + selectedArrow.dx,
                  y: selectedArrow.y + selectedArrow.dy,
                };
          return (
            <Circle
              key={`${selectedArrow.id}-${end}`}
              // Pressing it keeps the arrow selected; it is never exported.
              name={`${ANNOTATION_NAME} ${EXPORT_HIDDEN}`}
              x={at.x * unit}
              y={at.y * unit}
              radius={END_HANDLE / zoom}
              fill="#ffffff"
              stroke={SELECTION_COLOR}
              strokeWidth={1.5 / zoom}
              hitFunc={(context, shape) => {
                context.beginPath();
                context.arc(0, 0, MIN_HIT / zoom, 0, Math.PI * 2, false);
                context.closePath();
                context.fillStrokeShape(shape);
              }}
              {...endProps(selectedArrow, end)}
            />
          );
        })}
      {/* Chevrons stay straight, so they get no bend handle. */}
      {selectedArrow &&
        selectedArrow.style !== "chevrons" &&
        (() => {
          const tail = { x: selectedArrow.x * unit, y: selectedArrow.y * unit };
          const tip = {
            x: (selectedArrow.x + selectedArrow.dx) * unit,
            y: (selectedArrow.y + selectedArrow.dy) * unit,
          };
          const { handle } = arrowCurve(tail, tip, selectedArrow.bend);
          return (
            <Circle
              key={`${selectedArrow.id}-bend`}
              name={`${ANNOTATION_NAME} ${EXPORT_HIDDEN}`}
              x={handle.x}
              y={handle.y}
              radius={(END_HANDLE * 0.9) / zoom}
              fill={SELECTION_COLOR}
              stroke="#ffffff"
              strokeWidth={1.5 / zoom}
              hitFunc={(context, shape) => {
                context.beginPath();
                context.arc(0, 0, MIN_HIT / zoom, 0, Math.PI * 2, false);
                context.closePath();
                context.fillStrokeShape(shape);
              }}
              {...bendProps(selectedArrow)}
            />
          );
        })()}
      {selected && selected.kind !== "arrow" && (
        <Transformer
          ref={transformerRef}
          name={EXPORT_HIDDEN}
          rotateEnabled={false}
          keepRatio={roundSelection}
          enabledAnchors={
            roundSelection
              ? ["top-left", "top-right", "bottom-left", "bottom-right"]
              : undefined
          }
          flipEnabled={false}
          ignoreStroke
          borderStroke={SELECTION_COLOR}
          anchorStroke={SELECTION_COLOR}
          anchorSize={9}
          anchorCornerRadius={5}
          padding={selected.kind === "step" ? 3 : 0}
          // Not smaller than a few screen pixels.
          boundBoxFunc={(previous, next) => {
            if (Math.abs(next.width) < 6 || Math.abs(next.height) < 6)
              return previous;
            if (selected.kind !== "step") return next;
            // A step stays between its smallest and largest size. The box is
            // in screen px, with the selection's padding on each side.
            const standard = 2 * STEP_RADIUS * weight * zoom;
            const size = (Math.abs(next.width) - 6) / standard;
            return size < MIN_STEP_SIZE || size > MAX_STEP_SIZE
              ? previous
              : next;
          }}
        />
      )}
    </Group>
  );
}
