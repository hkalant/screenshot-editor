import type Konva from "konva";
import { Group, Image as KonvaImage, Rect } from "react-konva";
import { hexToRgba } from "@/lib/design/colors";
import type { FramedBox } from "@/lib/design/layout";
import type { FrameSpec, ShadowSpec, ShotLayer } from "@/lib/design/schema";
import type { LoadedImage } from "@/lib/image/load";
import { isOpaque } from "@/lib/image/opaque";
import {
  framePalette,
  hasShadow,
  insideStroke,
  isPlainShot,
  outsideStroke,
  roundedRectPath,
} from "@/lib/render/frame";
import { ChromeNode } from "./Chrome";

const insetRadii = (radii: number | number[], by: number) =>
  Array.isArray(radii)
    ? radii.map((radius) => Math.max(0, radius - by))
    : Math.max(0, radii - by);

/** Konva shadow props. Shadows are canvas px: never multiplied by the shot's scale. */
export function shadowProps(shadow: ShadowSpec) {
  return {
    shadowEnabled: hasShadow(shadow),
    shadowColor: shadow.color,
    shadowOpacity: shadow.opacity,
    shadowBlur: shadow.blur,
    shadowOffsetX: shadow.offsetX,
    shadowOffsetY: shadow.offsetY,
  };
}

/**
 * A screenshot in a window frame, or none: its shadow, border and corners.
 * The main screenshot draws devices itself; second screenshots use this too.
 */
export function FramedShot({
  image,
  box,
  frame,
  shadow: shadowSpec,
  border,
  listening,
}: {
  image: LoadedImage;
  box: FramedBox;
  frame: FrameSpec;
  shadow: ShadowSpec;
  border: ShotLayer["border"];
  listening: boolean;
}) {
  const shadow = shadowProps(shadowSpec);
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
      listening={listening}
    />
  );

  let body;
  if (isPlainShot({ frame })) {
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
          listening={listening}
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
          listening={listening}
        />
        {/* Clipped to the outline: under a title bar the content's top
            corners are square, and a radius taller than the bar would
            otherwise let them stick out past the rounded window. */}
        <Group clipFunc={clipToOutline} listening={listening}>
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
    <>
      {body}
      {borderNode}
    </>
  );
}
