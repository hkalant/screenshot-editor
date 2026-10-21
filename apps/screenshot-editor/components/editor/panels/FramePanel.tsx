import { ToggleGroup } from "radix-ui";
import { useId } from "react";
import { isDeviceKind, suggestDevice } from "@/lib/design/devices";
import {
  DEVICE_OPTIONS,
  FRAME_LABELS,
  FRAME_OPTIONS,
  FRAMES_WITH_TITLE,
  FRAMES_WITH_URL,
  isFrameKind,
} from "@/lib/design/frames";
import { MAX_FRAME_TEXT } from "@/lib/design/limits";
import type { FrameTheme } from "@/lib/render/frame";
import type { FrameKind } from "@/lib/design/schema";
import {
  selectActiveImage,
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

const SUGGESTION_HINTS = {
  phone: "Shaped like a phone screenshot.",
  tablet: "Shaped like a tablet screenshot.",
  laptop: "Shaped like a computer screenshot, so Laptop or Monitor suits it.",
} as const;

const itemClass =
  "group flex min-w-0 flex-col items-center gap-1.5 rounded-md p-1 text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid data-[state=on]:text-foreground";

function FrameItem({
  kind,
  theme,
  suggested = false,
  describedBy,
}: {
  kind: FrameKind;
  theme: FrameTheme;
  suggested?: boolean;
  describedBy?: string;
}) {
  return (
    <ToggleGroup.Item
      value={kind}
      className={itemClass}
      aria-describedby={describedBy}
    >
      <FramePreview
        kind={kind}
        theme={theme}
        className="ring-offset-[3px] ring-offset-background transition-shadow group-data-[state=on]:ring-[1.5px] group-data-[state=on]:ring-(--selection-ring)"
      />
      {FRAME_LABELS[kind]}
      {/* Said by the hint it points to, so not part of the name. */}
      {suggested && (
        <span aria-hidden className="-mt-1 font-normal text-muted-foreground">
          Suggested
        </span>
      )}
    </ToggleGroup.Item>
  );
}

/** The frame choice and its options, shown at the top of the Style panel. */
export function FrameOptions() {
  const frame = useEditorStore((state) => selectShot(state).frame);
  const setFrame = useEditorStore((state) => state.setFrame);
  const image = useEditorStore(selectActiveImage);
  const suggestion = image ? suggestDevice(image) : null;
  const hintId = useId();
  const device = isDeviceKind(frame.kind);

  return (
    <div className="space-y-6">
      {/* One choice: a window frame or a device. The section heading already
          says "Frame", so the group isn't labelled twice on screen. */}
      <ToggleGroup.Root
        type="single"
        aria-label="Frame"
        value={frame.kind}
        // Radix reports "" when the active frame is clicked again; keep it.
        onValueChange={(kind) => {
          if (isFrameKind(kind)) setFrame({ kind });
        }}
        className="space-y-5"
      >
        <div className="grid grid-cols-3 gap-2">
          {FRAME_OPTIONS.map((kind) => (
            <FrameItem key={kind} kind={kind} theme={frame.theme} />
          ))}
        </div>
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground">Devices</h3>
          <div className="grid grid-cols-3 gap-2">
            {DEVICE_OPTIONS.map((kind) => (
              <FrameItem
                key={kind}
                kind={kind}
                theme={frame.theme}
                suggested={kind === suggestion}
                describedBy={kind === suggestion ? hintId : undefined}
              />
            ))}
          </div>
          <p id={hintId} className="text-xs text-muted-foreground">
            {suggestion && `${SUGGESTION_HINTS[suggestion]} `}
            Devices turn to match the screenshot&rsquo;s shape.
          </p>
        </div>
      </ToggleGroup.Root>

      {frame.kind !== "none" && !device && (
        <Segmented
          label="Frame theme"
          glide
          value={frame.theme}
          options={THEME_OPTIONS}
          onChange={(theme) => setFrame({ theme })}
        />
      )}

      {FRAMES_WITH_TITLE.includes(frame.kind) && (
        <TextField
          label="Window title"
          value={frame.title}
          placeholder="Untitled"
          onChange={(title) => setFrame({ title })}
        />
      )}

      {FRAMES_WITH_URL.includes(frame.kind) && (
        <TextField
          label="Address"
          value={frame.url}
          placeholder="example.com"
          inputMode="url"
          onChange={(url) => setFrame({ url })}
        />
      )}
    </div>
  );
}
