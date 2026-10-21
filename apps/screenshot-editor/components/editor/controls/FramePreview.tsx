import {
  DEVICE_COLORS,
  isDeviceKind,
  type DeviceKind,
} from "@/lib/design/devices";
import type { ReactNode } from "react";
import type { FrameKind } from "@/lib/design/schema";
import {
  framePalette,
  TRAFFIC_LIGHT_COLORS,
  type FrameTheme,
} from "@/lib/render/frame";
import { cn } from "@/lib/utils";

// Small HTML pictures of each frame for the frame picker. They use the same
// colours as the canvas, which never changes with the interface theme.

const BACKDROP = "linear-gradient(135deg, #424a52 0%, #d10373 100%)";
const SCREEN = "#f8fafc";
const SCREEN_LINE = "#cbd5e1";

function Lights({ size = 3 }: { size?: number }) {
  return (
    <span className="flex gap-[2px]">
      {TRAFFIC_LIGHT_COLORS.map((color) => (
        <span
          key={color}
          className="rounded-full"
          style={{ width: size, height: size, backgroundColor: color }}
        />
      ))}
    </span>
  );
}

/** Windows minimise, maximise and close. */
function Captions() {
  return (
    <>
      <span className="h-px w-[4px] bg-current" />
      <span className="size-[4px] border border-current" />
      <span className="relative size-[4px]">
        <span className="absolute top-1/2 left-0 h-px w-full rotate-45 bg-current" />
        <span className="absolute top-1/2 left-0 h-px w-full -rotate-45 bg-current" />
      </span>
    </>
  );
}

/** A screenshot stand-in: a light page with two lines of "text". */
function Screen({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex h-7 flex-col gap-[3px] p-[5px]", className)}
      style={{ backgroundColor: SCREEN }}
    >
      <span
        className="h-[3px] w-3/5 rounded-full"
        style={{ backgroundColor: SCREEN_LINE }}
      />
      <span
        className="h-[3px] w-2/5 rounded-full"
        style={{ backgroundColor: SCREEN_LINE }}
      />
    </div>
  );
}

function Bar({
  kind,
  theme,
}: {
  kind: Exclude<FrameKind, "none" | "glass" | DeviceKind>;
  theme: FrameTheme;
}) {
  const palette = framePalette(theme);
  const style = {
    backgroundColor: palette.bar,
    borderBottom: `1px solid ${palette.separator}`,
  };
  switch (kind) {
    case "macos":
      return (
        <div className="flex h-[8px] items-center px-[3px]" style={style}>
          <Lights />
        </div>
      );
    case "browser":
      return (
        <div
          className="relative flex h-[11px] items-center px-[3px]"
          style={style}
        >
          <Lights />
          <span
            className="absolute inset-y-[3px] left-1/2 w-2/5 -translate-x-1/2 rounded-full"
            style={{ backgroundColor: palette.pill }}
          />
        </div>
      );
    case "windows-browser":
      return (
        <div
          className="flex h-[11px] items-center gap-[4px] px-[3px]"
          style={{ ...style, color: palette.text }}
        >
          <span
            className="h-[5px] flex-1 rounded-full"
            style={{ backgroundColor: palette.pill }}
          />
          <Captions />
        </div>
      );
    case "windows":
      return (
        <div
          className="flex h-[8px] items-center justify-end gap-[4px] px-[3px]"
          style={{ ...style, color: palette.text }}
        >
          <Captions />
        </div>
      );
    case "minimal":
      return (
        <div
          className="flex h-[5px] items-center gap-[2px] px-[3px]"
          style={style}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-[2px] rounded-full"
              style={{ backgroundColor: palette.dot }}
            />
          ))}
        </div>
      );
  }
}

/** A small screen for the device pictures: `width` by `height` px. */
function DeviceScreen({
  width,
  height,
  radius = 1,
  top = 5,
}: {
  width: number;
  height: number;
  radius?: number;
  top?: number;
}) {
  return (
    <div
      className="flex flex-col gap-[3px] px-[5px] pb-[5px]"
      style={{
        width,
        height,
        paddingTop: top,
        borderRadius: radius,
        backgroundColor: SCREEN,
      }}
    >
      <span
        className="h-[3px] w-3/5 rounded-full"
        style={{ backgroundColor: SCREEN_LINE }}
      />
      <span
        className="h-[3px] w-2/5 rounded-full"
        style={{ backgroundColor: SCREEN_LINE }}
      />
    </div>
  );
}

/** The device's body around a screen. */
function Shell({
  padding,
  radius,
  children,
}: {
  padding: string;
  radius: string;
  children: ReactNode;
}) {
  return (
    <div
      className="shadow-md"
      style={{
        padding,
        borderRadius: radius,
        backgroundColor: DEVICE_COLORS.body,
        boxShadow: `inset 0 0 0 1px ${DEVICE_COLORS.rim}`,
      }}
    >
      {children}
    </div>
  );
}

function DevicePicture({ kind }: { kind: DeviceKind }) {
  const stand = { backgroundColor: DEVICE_COLORS.stand };
  switch (kind) {
    case "phone":
      return (
        <Shell padding="3px" radius="8px">
          <DeviceScreen width={22} height={46} radius={5} top={8} />
        </Shell>
      );
    case "tablet":
      return (
        <Shell padding="5px" radius="7px">
          <DeviceScreen width={46} height={32} radius={2} />
        </Shell>
      );
    case "laptop":
      return (
        <div className="flex flex-col items-center">
          <Shell padding="3px" radius="3px 3px 0 0">
            <DeviceScreen width={52} height={32} />
          </Shell>
          <span className="h-[5px] w-[70px] rounded-b-[5px]" style={stand} />
        </div>
      );
  }
}

type Props = {
  kind: FrameKind;
  theme: FrameTheme;
  className?: string;
};

export function FramePreview({ kind, theme, className }: Props) {
  const palette = framePalette(theme);
  let picture;
  if (isDeviceKind(kind)) {
    // Devices are drawn at their own size, not the window frames' width.
    picture = <DevicePicture kind={kind} />;
  } else if (kind === "none") {
    picture = <Screen className="rounded-[3px] shadow-md" />;
  } else if (kind === "glass") {
    picture = (
      <div
        className="rounded-[5px] p-[2.5px] shadow-sm"
        style={{
          backgroundColor: palette.ringFill,
          boxShadow: `inset 0 1px 0 ${palette.ringHighlight}, inset 0 0 0 1px ${palette.ringStroke}`,
        }}
      >
        <Screen className="rounded-[3px] shadow-md" />
      </div>
    );
  } else {
    picture = (
      <div
        className="overflow-hidden rounded-[3px] shadow-md"
        style={{ backgroundColor: palette.body }}
      >
        <Bar kind={kind} theme={theme} />
        <Screen />
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className={cn(
        "flex aspect-[4/3] w-full items-center justify-center rounded-md",
        className,
      )}
      style={{ backgroundImage: BACKDROP }}
    >
      {isDeviceKind(kind) ? picture : <div className="w-[72%]">{picture}</div>}
    </div>
  );
}
