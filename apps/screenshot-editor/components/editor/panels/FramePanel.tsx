import { ToggleGroup } from "radix-ui";
import { useId } from "react";
import {
  DEVICE_KINDS,
  fittingDevices,
  frameFits,
  isDeviceKind,
  type DeviceKind,
} from "@/lib/design/devices";
import {
  DEVICE_OPTIONS,
  FRAME_LABELS,
  FRAME_OPTIONS,
  FRAMES_WITH_TITLE,
  FRAMES_WITH_URL,
  isFrameKind,
} from "@/lib/design/frames";
import { croppedSize } from "@/lib/design/crop";
import { MAX_FRAME_TEXT } from "@/lib/design/limits";
import type { FrameTheme } from "@/lib/render/frame";
import type { FrameKind } from "@/lib/design/schema";
import {
  selectActiveImage,
  selectHasSecondScreenshot,
  selectSelectedAnnotation,
  selectShot,
  useEditorStore,
} from "@/lib/store/editor";
import { FramePreview } from "../controls/FramePreview";
import { Segmented } from "../controls/Segmented";

const THEME_OPTIONS: readonly { value: FrameTheme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function TextField({
  label,
  value,
  placeholder,
  inputMode,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  inputMode?: "text" | "url";
  onChange: (value: string) => void;
}) {
  const id = useId();
  const sealHistory = useEditorStore((state) => state.sealHistory);
  return (
    <div className="space-y-2.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        maxLength={MAX_FRAME_TEXT}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize={inputMode === "url" ? "none" : undefined}
        onChange={(event) => onChange(event.target.value)}
        // Typing merges into one undo step; leaving the field ends it.
        onBlur={sealHistory}
        className="h-9 w-full min-w-0 rounded-md border border-input bg-background/70 px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      />
    </div>
  );
}

/** Why only these devices are offered, by what fits the screenshot. */
function fitHint(fitting: readonly DeviceKind[] | null): string {
  if (!fitting) return "Devices turn to match the screenshot’s shape.";
  switch (fitting.join()) {
    case "phone":
      return "Shaped like a phone screenshot, so only Phone fits. Window frames are for computer screenshots.";
    case "tablet":
      return "Shaped like a tablet screenshot, so only Tablet fits.";
    case "laptop":
      return "Shaped like a computer screenshot, so only Laptop fits.";
    case "laptop,tablet":
      return "Shaped like a laptop or tablet screenshot, so either fits.";
    default:
      return "Not shaped like a whole screen, so no device fits. Window frames fit any screenshot.";
  }
}

const itemClass =
  "group flex min-w-0 flex-col items-center gap-1.5 rounded-md p-1 text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:pointer-events-none disabled:opacity-40 data-[state=on]:text-foreground";

function FrameItem({
  kind,
  theme,
  disabled = false,
  describedBy,
}: {
  kind: FrameKind;
  theme: FrameTheme;
  disabled?: boolean;
  describedBy?: string;
}) {
  return (
    <ToggleGroup.Item
      value={kind}
      className={itemClass}
      disabled={disabled}
      aria-describedby={describedBy}
    >
      <FramePreview
        kind={kind}
        theme={theme}
        className="ring-offset-[3px] ring-offset-background transition-shadow group-data-[state=on]:ring-[1.5px] group-data-[state=on]:ring-(--selection-ring)"
      />
      {FRAME_LABELS[kind]}
    </ToggleGroup.Item>
  );
}

/** The frame choice and its options, shown at the top of the Style panel. */
export function FrameOptions() {
  const frame = useEditorStore((state) => selectShot(state).frame);
  const setFrame = useEditorStore((state) => state.setFrame);
  const setScreenshotText = useEditorStore((state) => state.setScreenshotText);
  const setScreenshotFrame = useEditorStore(
    (state) => state.setScreenshotFrame,
  );
  const main = useEditorStore(selectActiveImage);
  // While the second screenshot is selected, its frame, title and address
  // are edited here; the theme stays shared.
  const selected = useEditorStore(selectSelectedAnnotation);
  const second = selected?.kind === "screenshot" ? selected : null;
  const hasSecond = useEditorStore(selectHasSecondScreenshot);
  const secondImage = useEditorStore((state) =>
    second ? state.images[second.imageId] : undefined,
  );
  const image = second
    ? secondImage && croppedSize(secondImage, second.crop)
    : main;
  const kind = second ? second.frame : frame.kind;
  const choose = (next: FrameKind) =>
    second ? setScreenshotFrame(second.id, next) : setFrame({ kind: next });
  const text = second ?? frame;
  const setText = (patch: { title?: string; url?: string }) =>
    second ? setScreenshotText(second.id, patch) : setFrame(patch);
  const of = second ? " of the second screenshot" : "";
  // Without a screenshot there is no shape to go by, so every device is offered.
  const fitting = image ? fittingDevices(image) : null;
  const hintId = useId();
  const device = isDeviceKind(kind);

  return (
    <div className="space-y-6">
      {/* With two screenshots, which one this is for. */}
      {hasSecond && (
        <p className="text-xs text-muted-foreground" data-testid="frame-for">
          You’re choosing a frame for the {second ? "second" : "main"}{" "}
          screenshot.
        </p>
      )}
      {/* One choice: a window frame or a device. The section heading already
          says "Frame", so the group isn't labelled twice on screen. */}
      <ToggleGroup.Root
        type="single"
        aria-label={second ? "Frame of the second screenshot" : "Frame"}
        value={kind}
        // Radix reports "" when the active frame is clicked again; keep it.
        onValueChange={(next) => {
          if (isFrameKind(next)) choose(next);
        }}
        className="space-y-5"
      >
        <div className="grid grid-cols-3 gap-2">
          {FRAME_OPTIONS.map((option) => {
            const fits = !image || frameFits(option, image);
            return (
              <FrameItem
                key={option}
                kind={option}
                theme={frame.theme}
                disabled={!fits}
                describedBy={fits ? undefined : hintId}
              />
            );
          })}
        </div>
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground">Devices</h3>
          <div className="grid grid-cols-3 gap-2">
            {DEVICE_OPTIONS.map((option) => (
              <FrameItem
                key={option}
                kind={option}
                theme={frame.theme}
                disabled={!(fitting ?? DEVICE_KINDS).includes(option)}
                describedBy={hintId}
              />
            ))}
          </div>
          <p id={hintId} className="text-xs text-muted-foreground">
            {fitHint(fitting)}
          </p>
        </div>
      </ToggleGroup.Root>

      {kind !== "none" && !device && (
        <Segmented
          // Both screenshots' frames have it.
          label="Frame theme"
          glide
          value={frame.theme}
          options={THEME_OPTIONS}
          onChange={(theme) => setFrame({ theme })}
        />
      )}

      {FRAMES_WITH_TITLE.includes(kind) && (
        <TextField
          label={`Window title${of}`}
          value={text.title}
          placeholder="Untitled"
          onChange={(title) => setText({ title })}
        />
      )}

      {FRAMES_WITH_URL.includes(kind) && (
        <TextField
          label={`Address${of}`}
          value={text.url}
          placeholder="example.com"
          inputMode="url"
          onChange={(url) => setText({ url })}
        />
      )}
    </div>
  );
}
