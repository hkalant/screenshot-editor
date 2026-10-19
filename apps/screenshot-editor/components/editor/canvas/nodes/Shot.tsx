import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useEffect, useMemo, useRef } from "react";
import { Group, Image as KonvaImage, Rect } from "react-konva";
import { canvasArea } from "@/lib/design/annotations";
import { hexToRgba } from "@/lib/design/colors";
import type { DesignLayout } from "@/lib/design/layout";
import type { ShadowSpec, ShotLayer } from "@/lib/design/schema";
import type { LoadedImage } from "@/lib/image/load";
import { isOpaque } from "@/lib/image/opaque";
import {
  framePalette,
  hasShadow,
  insideStroke,
  outsideStroke,
  isPlainShot,
  roundedRectPath,
} from "@/lib/render/frame";
import { NO_GUIDES, snapDrag } from "@/lib/render/snap";
import { useEditorStore } from "@/lib/store/editor";
import { AnnotationsNode } from "./Annotations";
import { ChromeNode } from "./Chrome";
import { useGuides } from "./Guides";

type Props = {
  image: LoadedImage;
  shot: ShotLayer;
  layout: DesignLayout;
  /** On-screen zoom of the stage (for screen-pixel snapping distances). */
  zoom: number;
};

const insetRadii = (radii: number | number[], by: number) =>
  Array.isArray(radii)
    ? radii.map((radius) => Math.max(0, radius - by))
    : Math.max(0, radii - by);

/** Konva shadow props. Shadows are canvas px: never multiplied by the shot's scale. */
function shadowProps(shadow: ShadowSpec) {
  return {
    shadowEnabled: hasShadow(shadow),
    shadowColor: shadow.color,
    shadowOpacity: shadow.opacity,
    shadowBlur: shadow.blur,
    shadowOffsetX: shadow.offsetX,
    shadowOffsetY: shadow.offsetY,
  };
}

function setCursor(event: KonvaEventObject<unknown>, cursor: string) {
  const container = event.target.getStage()?.container();
  if (container) container.style.cursor = cursor;
}

/**
 * The framed screenshot, rotated about its centre. On a fixed canvas it can be
 * dragged; it snaps to the canvas centre lines.
 */
export function ShotNode({ image, shot, layout, zoom }: Props) {
  const box = layout.shot;
  // While a step or shape tool is on, presses draw instead of moving the shot.
  const selecting = useEditorStore(
    (state) => state.annotationTool === "select",
  );
  const draggable = layout.draggable && selecting;
  const setPosition = useEditorStore((state) => state.setPosition);
  const sealHistory = useEditorStore((state) => state.sealHistory);
  const beginGesture = useEditorStore((state) => state.beginGesture);
  const groupRef = useRef<Konva.Group>(null);
  const dragging = useRef(false);
  // Annotations can go anywhere on the canvas, the background included.
  const canvasWidth = layout.canvas.width;
  const canvasHeight = layout.canvas.height;
  const imageX = box.x + box.image.x;
  const imageY = box.y + box.image.y;
  const imageWidth = box.image.width;
  const area = useMemo(
    () =>
      canvasArea(
        { width: canvasWidth, height: canvasHeight },
        { x: imageX, y: imageY, width: imageWidth, height: 0 },
      ),
    [canvasWidth, canvasHeight, imageX, imageY, imageWidth],
  );

  // Leave no guide or grab cursor behind when the shot stops being draggable.
  useEffect(() => {
    if (!draggable) return;
    const group = groupRef.current;
    const drag = dragging;
    return () => {
      drag.current = false;
      useGuides.setState(NO_GUIDES);
      const container = group?.getStage()?.container();
      if (container) container.style.cursor = "";
    };
  }, [draggable]);

  const onDragMove = (event: KonvaEventObject<DragEvent>) => {
    const node = event.target;
    if (node !== event.currentTarget) return;
    const snap = snapDrag(node.position(), layout.canvas, zoom);
    node.position(snap.centre);
    useGuides.setState(snap.guides);
    // Every move of one drag merges into one undo step.
    setPosition(snap.position.x, snap.position.y);
  };

  const dragProps = draggable
    ? {
        draggable: true,
        onDragStart: (event: KonvaEventObject<DragEvent>) => {
          // An annotation's drag is its own.
          if (event.target !== event.currentTarget) return;
          dragging.current = true;
          // The whole drag is one undo step, however slow.
          beginGesture();
          setCursor(event, "grabbing");
        },
        onDragMove,
        onDragEnd: (event: KonvaEventObject<DragEvent>) => {
          if (event.target !== event.currentTarget) return;
          dragging.current = false;
          useGuides.setState(NO_GUIDES);
          sealHistory();
          setCursor(event, "grab");
        },
        onMouseEnter: (event: KonvaEventObject<MouseEvent>) => {
          if (event.target.findAncestor(".annotation", true)) return;
          setCursor(event, dragging.current ? "grabbing" : "grab");
        },
        onMouseLeave: (event: KonvaEventObject<MouseEvent>) => {
          if (!dragging.current) setCursor(event, "");
        },
      }
    : {};

  const shadow = shadowProps(shot.shadow);
  const { border, frame } = shot;
  const size = { width: box.width, height: box.height };
  const clipToOutline = (context: Konva.Context) =>
    roundedRectPath(context, box.width, box.height, box.radius);
  // Around the outside, so the border never covers the screenshot.
  const borderBox = outsideStroke(size, box.radius, border.width);
  const borderNode = borderBox && (
    <Rect
      {...borderBox}
      stroke={hexToRgba(border.color, border.opacity)}
      listening={false}
    />
  );
  const imageNode = (withShadow: boolean) => (
    <KonvaImage
      image={image.source}
      x={box.image.x}
      y={box.image.y}
      width={box.image.width}
      height={box.image.height}
      cornerRadius={box.imageRadii}
      {...shadow}
      shadowEnabled={withShadow && shadow.shadowEnabled}
      listening={draggable}
    />
  );

  let body;
  if (isPlainShot(shot)) {
    // One Konva Image with rounded corners and a shadow. With both set, Konva
    // draws the rounded image into a buffer first, so the shadow follows the
    // corners and a transparent PNG's alpha. Don't clip it with a Group (that
    // removes the shadow) and don't turn off perfectDrawEnabled (that skips
    // the buffer). konva is pinned for this reason.
    //
    // An opaque screenshot casts it from a rounded rectangle behind instead:
    // after the shot moves, Safari stops blurring a buffer's shadow on screen.
    body = isOpaque(image.source, image.blob.type) ? (
      <>
        {/* A pixel inside the image, so no edge shows past its smoothing. */}
        <Rect
          x={box.image.x + 1}
          y={box.image.y + 1}
          width={Math.max(0, box.image.width - 2)}
          height={Math.max(0, box.image.height - 2)}
          cornerRadius={insetRadii(box.imageRadii, 1)}
          fill="#ffffff"
          {...shadow}
          listening={false}
        />
        {imageNode(false)}
      </>
    ) : (
      imageNode(true)
    );
  } else if (frame.kind === "glass") {
    const ring = framePalette(frame.theme);
    const hairline = insideStroke(size, box.radius, 1.5 * box.unit);
    body = (
      <>
        {/* Translucent glass with no shadow; the content casts it. */}
        <Rect
          width={box.width}
          height={box.height}
          cornerRadius={box.radius}
          fill={ring.ringFill}
          listening={draggable}
        />
        {hairline && (
          // A specular edge, lit from above.
          <Rect
            {...hairline}
            strokeLinearGradientStartPoint={{ x: 0, y: 0 }}
            strokeLinearGradientEndPoint={{ x: 0, y: hairline.height }}
            strokeLinearGradientColorStops={[
              0,
              ring.ringHighlight,
              1,
              ring.ringStroke,
            ]}
            listening={false}
          />
        )}
        {/* The image itself casts the shadow, as with no frame. */}
        {imageNode(true)}
      </>
    );
  } else {
    const { chrome } = box;
    body = (
      <>
        {/* Opaque, so it can carry the shadow. */}
        <Rect
          width={box.width}
          height={box.height}
          cornerRadius={box.radius}
          fill={framePalette(frame.theme).body}
          {...shadow}
          listening={draggable}
        />
        {/* Clipped to the outline: under a title bar the content's top
            corners are square, and a radius taller than the bar would
            otherwise let them stick out past the rounded window. */}
        <Group clipFunc={clipToOutline} listening={draggable}>
          {chrome && (
            <ChromeNode
              frame={frame}
              rect={chrome}
              unit={box.unit}
              cornerRadius={box.radius}
            />
          )}
          {imageNode(false)}
        </Group>
      </>
    );
  }

  return (
    <Group
      ref={groupRef}
      x={box.x + box.width / 2}
      y={box.y + box.height / 2}
      offsetX={box.width / 2}
      offsetY={box.height / 2}
      rotation={box.rotation}
      {...dragProps}
    >
      {body}
      {borderNode}
      <AnnotationsNode
        image={box.image}
        source={image}
        area={area}
        zoom={zoom}
        shotDraggable={draggable}
      />
    </Group>
  );
}
