import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useEffect, useMemo, useRef } from "react";
import { Group, Image as KonvaImage } from "react-konva";
import { canvasArea } from "@/lib/design/annotations";
import type { DesignLayout } from "@/lib/design/layout";
import type { ShotLayer } from "@/lib/design/schema";
import type { LoadedImage } from "@/lib/image/load";
import { groupOffset, NO_GUIDES, snapDrag } from "@/lib/render/snap";
import { useEditorStore } from "@/lib/store/editor";
import { AnnotationsNode } from "./Annotations";
import { FramedShot, shadowProps } from "./FramedShot";
import { DeviceNode } from "./Device";
import { useGuides } from "./Guides";

type Props = {
  image: LoadedImage;
  shot: ShotLayer;
  layout: DesignLayout;
  /** On-screen zoom of the stage (for screen-pixel snapping distances). */
  zoom: number;
};

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

  // A second screenshot moves with it, and the two are centred together.
  const second = useEditorStore((state) =>
    state.design.annotations.find(
      (annotation) => annotation.kind === "screenshot",
    ),
  );

  const onDragMove = (event: KonvaEventObject<DragEvent>) => {
    const node = event.target;
    if (node !== event.currentTarget) return;
    const unit = box.image.width;
    const offset = groupOffset(
      box.width,
      box.height,
      box.rotation,
      second
        ? [
            {
              x: box.image.x + second.x * unit,
              y: box.image.y + second.y * unit,
              width: second.width * unit,
              height: second.height * unit,
            },
          ]
        : [],
    );
    const snap = snapDrag(
      node.position(),
      layout.canvas,
      zoom,
      undefined,
      offset,
    );
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

  const body = box.device ? (
    <DeviceNode
      device={box.device}
      shadow={shadowProps(shot.shadow)}
      listening={draggable}
    >
      <KonvaImage
        image={image.source}
        x={box.image.x}
        y={box.image.y}
        width={box.image.width}
        height={box.image.height}
        cornerRadius={box.imageRadii}
        listening={draggable}
      />
    </DeviceNode>
  ) : (
    // A device has its own edge, and a border would box in a laptop's base.
    <FramedShot
      image={image}
      box={box}
      frame={shot.frame}
      shadow={shot.shadow}
      border={shot.border}
      listening={draggable}
    />
  );

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
