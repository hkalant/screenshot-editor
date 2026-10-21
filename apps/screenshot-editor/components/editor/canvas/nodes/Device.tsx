import type Konva from "konva";
import type { ReactNode } from "react";
import { Rect, Shape } from "react-konva";
import {
  DEVICE_COLORS,
  type DeviceGeometry,
  type DevicePart,
} from "@/lib/design/devices";

/** Traces a rectangle with its own radius per corner (TL, TR, BR, BL). */
function tracePart(context: Konva.Context, part: DevicePart) {
  const { x, y, width, height } = part;
  const limit = Math.min(width, height) / 2;
  const [tl, tr, br, bl] = part.radii.map((radius) =>
    Math.max(0, Math.min(radius, limit)),
  );
  context.moveTo(x + tl, y);
  context.lineTo(x + width - tr, y);
  context.arc(x + width - tr, y + tr, tr, -Math.PI / 2, 0, false);
  context.lineTo(x + width, y + height - br);
  context.arc(x + width - br, y + height - br, br, 0, Math.PI / 2, false);
  context.lineTo(x + bl, y + height);
  context.arc(x + bl, y + height - bl, bl, Math.PI / 2, Math.PI, false);
  context.lineTo(x, y + tl);
  context.arc(x + tl, y + tl, tl, Math.PI, Math.PI * 1.5, false);
  context.closePath();
}

const partProps = (part: DevicePart) => ({
  x: part.x,
  y: part.y,
  width: part.width,
  height: part.height,
  cornerRadius: part.radii,
});

type Props = {
  device: DeviceGeometry;
  /** Konva shadow props for the whole device. */
  shadow: Konva.ShapeConfig;
  listening: boolean;
  /** The screenshot, drawn on the screen under the camera and speaker. */
  children: ReactNode;
};

/** A phone, tablet or laptop around the screenshot. */
export function DeviceNode({ device, shadow, listening, children }: Props) {
  const { body, screen, rim } = device;
  const half = rim / 2;
  return (
    <>
      {/* One outline for the body and stand, so they cast a single shadow. */}
      <Shape
        sceneFunc={(context, shape) => {
          context.beginPath();
          for (const part of [body, ...device.stand]) tracePart(context, part);
          context.fillShape(shape);
        }}
        fill={DEVICE_COLORS.body}
        {...shadow}
        listening={listening}
      />
      {device.stand.map((part, i) => (
        <Rect
          key={i}
          {...partProps(part)}
          fill={DEVICE_COLORS.stand}
          listening={false}
        />
      ))}
      <Rect
        x={body.x + half}
        y={body.y + half}
        width={Math.max(0, body.width - rim)}
        height={Math.max(0, body.height - rim)}
        cornerRadius={body.radii.map((radius) => Math.max(0, radius - half))}
        stroke={DEVICE_COLORS.rim}
        strokeWidth={rim}
        listening={false}
      />
      <Rect
        {...partProps(screen)}
        fill={DEVICE_COLORS.screen}
        listening={false}
      />
      {children}
      {device.details.map((part, i) => (
        <Rect key={i} {...partProps(part)} fill={part.fill} listening={false} />
      ))}
    </>
  );
}
