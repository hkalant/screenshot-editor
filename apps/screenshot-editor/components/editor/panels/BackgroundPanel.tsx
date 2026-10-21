import { ImageUp } from "lucide-react";
import { useId, useMemo, useRef, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { createDefaultDesign, defaultBackground } from "@/lib/design/defaults";
import {
  BROOKES_COLORS,
  DEFAULT_GRADIENT,
  GRADIENT_PRESETS,
  getGradientPreset,
  toCssLinearGradient,
} from "@/lib/design/gradients";
import { ANGLE, BLUR } from "@/lib/design/limits";
import type {
  Background,
  BackgroundFx,
  Design,
  LinearBackground,
  RadialBackground,
} from "@/lib/design/schema";
import { ACCEPT_ATTR } from "@/lib/image/accept";
import { ingestFile } from "@/lib/image/ingest";
import { imageThumbnail } from "@/lib/render/wallpaper";
import { selectLastBackgroundUpload, useEditorStore } from "@/lib/store/editor";
import {
  backgroundChoice,
  BackgroundKindPicker,
  type BackgroundChoice,
} from "../controls/BackgroundKindPicker";
import { ColorField } from "../controls/ColorField";
import { LabeledSlider } from "../controls/LabeledSlider";
import { SwatchGrid, type Swatch } from "../controls/SwatchGrid";

/** Where the sliders go back to when their thumb is double-clicked. */
const defaultDesign = createDefaultDesign();

const GRADIENT_SWATCHES: readonly Swatch[] = GRADIENT_PRESETS.map((preset) => ({
  id: preset.id,
  name: preset.name,
  style: { backgroundImage: toCssLinearGradient(preset.angle, preset.stops) },
}));

/** The newest gradient in the undo history, so switching back restores it. */
function lastGradient(past: readonly Design[]): Background | null {
  for (let i = past.length - 1; i >= 0; i -= 1) {
    const { background } = past[i];
    if (background.kind === "linear" || background.kind === "radial")
      return background;
  }
  return null;
}

/** Switches the background kind, starting from a sensible default for it. */
function chooseKind(choice: BackgroundChoice) {
  const state = useEditorStore.getState();
  switch (choice) {
    case "image":
      // A gradient; an uploaded image can be picked from the same panel.
      state.setBackground(lastGradient(state.past) ?? defaultBackground());
      break;
    case "solid":
      state.setBackground({ kind: "solid", color: "#ffffff" });
      break;
    case "none":
      state.setTransparent();
      break;
  }
}

export function BackgroundPanel() {
  const background = useEditorStore((state) => state.design.background);
  const fx = useEditorStore((state) => state.design.backgroundFx);
  const isGradient =
    background.kind === "linear" || background.kind === "radial";

  return (
    <div className="space-y-6">
      <BackgroundKindPicker
        value={backgroundChoice(background.kind)}
        onChange={chooseKind}
      />
      {(isGradient || background.kind === "image") && (
        <>
          <GradientSwatches
            presetId={isGradient ? background.presetId : null}
          />
          <ImageControls
            background={background.kind === "image" ? background : null}
          />
        </>
      )}
      {isGradient && <GradientControls background={background} />}
      {background.kind === "solid" && (
        <SolidControls color={background.color} />
      )}
      {background.kind === "image" && <EffectsControls fx={fx} />}
    </div>
  );
}

function GradientSwatches({ presetId }: { presetId: string | null }) {
  const applyGradientPreset = useEditorStore(
    (state) => state.applyGradientPreset,
  );
  return (
    <SwatchGrid
      label="Gradients"
      hideLabel
      swatches={GRADIENT_SWATCHES}
      selectedId={presetId}
      onSelect={applyGradientPreset}
      columns={5}
    />
  );
}

function GradientControls({
  background,
}: {
  background: LinearBackground | RadialBackground;
}) {
  const setGradientAngle = useEditorStore((state) => state.setGradientAngle);
  const setGradientStop = useEditorStore((state) => state.setGradientStop);
  const swapGradientStops = useEditorStore((state) => state.swapGradientStops);
  const { stops } = background;
  const last = stops.length - 1;

  return (
    <>
      {background.kind === "linear" && (
        <LabeledSlider
          label="Angle"
          value={background.angle}
          min={ANGLE.min}
          max={ANGLE.max}
          step={ANGLE.step}
          unit="°"
          // Back to the chosen gradient's own angle (the default gradient's
          // once its colours are edited and it is no longer a preset).
          defaultValue={
            (background.presetId
              ? getGradientPreset(background.presetId)?.angle
              : undefined) ?? DEFAULT_GRADIENT.angle
          }
          onChange={setGradientAngle}
        />
      )}
      <div className="space-y-1">
        <ColorField
          label="Start colour"
          value={stops[0].color}
          onChange={(color) => setGradientStop(0, color)}
        />
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="icon"
            className="size-6"
            aria-label="Swap colours"
            title="Swap colours"
            onClick={swapGradientStops}
          >
            <ArrowsUpDownIcon />
          </Button>
        </div>
        <ColorField
          label="End colour"
          value={stops[last].color}
          onChange={(color) => setGradientStop(last, color)}
        />
      </div>
    </>
  );
}

/** Font Awesome Free "arrows-up-down" (solid), CC BY 4.0. */
function ArrowsUpDownIcon() {
  return (
    <svg
      viewBox="0 0 320 512"
      aria-hidden="true"
      className="size-3 fill-current"
    >
      <path d="M182.6 9.4c-12.5-12.5-32.8-12.5-45.3 0l-96 96c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L128 109.3V402.7L86.6 361.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l96 96c12.5 12.5 32.8 12.5 45.3 0l96-96c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 402.7V109.3l41.4 41.4c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-96-96z" />
    </svg>
  );
}

const BROOKES_SOLID_COLORS: readonly { name: string; color: string }[] = [
  { name: "Charcoal", color: BROOKES_COLORS.charcoal },
  { name: "Charcoal 60%", color: BROOKES_COLORS.charcoal60 },
  { name: "Charcoal 20%", color: BROOKES_COLORS.charcoal20 },
  { name: "Charcoal 10%", color: BROOKES_COLORS.charcoal10 },
  { name: "Pink", color: BROOKES_COLORS.pink },
  { name: "Yellow", color: BROOKES_COLORS.yellow },
  { name: "Red 20%", color: BROOKES_COLORS.red20 },
  { name: "Green 20%", color: BROOKES_COLORS.green20 },
];

const BROOKES_SOLID_SWATCHES: readonly Swatch[] = BROOKES_SOLID_COLORS.map(
  ({ name, color }) => ({ id: color, name, style: { backgroundColor: color } }),
);

function SolidControls({ color }: { color: string }) {
  const setSolidColor = useEditorStore((state) => state.setSolidColor);
  const setBackground = useEditorStore((state) => state.setBackground);
  return (
    <div className="space-y-4">
      <ColorField label="Colour" value={color} onChange={setSolidColor} />
      <SwatchGrid
        label="Oxford Brookes"
        swatches={BROOKES_SOLID_SWATCHES}
        selectedId={color}
        columns={8}
        shape="dot"
        // A click is its own undo step, unlike dragging in the colour picker.
        onSelect={(next) => setBackground({ kind: "solid", color: next })}
      />
    </div>
  );
}

const UPLOAD_TILE_ID = "upload";

function ImageControls({
  background,
}: {
  background: Extract<Background, { kind: "image" }> | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const setBackgroundImage = useEditorStore(
    (state) => state.setBackgroundImage,
  );
  // Stays in the grid after switching away, so it can be picked again.
  const upload = useEditorStore(selectLastBackgroundUpload);
  const thumbnail = useMemo(
    () => (upload ? imageThumbnail(upload.source) : null),
    [upload],
  );
  const selectedId =
    background?.source.type === "upload" ? UPLOAD_TILE_ID : null;
  const uploadTile: Swatch | null = thumbnail
    ? {
        id: UPLOAD_TILE_ID,
        name: "Uploaded image",
        style: { backgroundImage: `url("${thumbnail}")` },
      }
    : null;

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // so picking the same file again still fires change
    if (file) void ingestFile(file, "background");
  };

  return (
    <div className="space-y-4">
      {uploadTile && (
        <SwatchGrid
          label="Your image"
          swatches={[uploadTile]}
          selectedId={selectedId}
          columns={3}
          aspect="aspect-[4/3]"
          onSelect={() => {
            if (upload && background?.source.type !== "upload")
              setBackgroundImage(upload);
          }}
        />
      )}
      <Button
        variant="outline"
        size="sm"
        className="w-full rounded-md"
        onClick={() => inputRef.current?.click()}
      >
        <ImageUp aria-hidden />
        Upload background
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        tabIndex={-1}
        aria-label="Background image file"
        data-testid="background-file-input"
        onChange={onFileChange}
      />
    </div>
  );
}

function EffectsControls({ fx }: { fx: BackgroundFx }) {
  const headingId = useId();
  const setBlur = useEditorStore((state) => state.setBlur);
  return (
    <section aria-labelledby={headingId} className="space-y-5 border-t pt-5">
      <h2
        id={headingId}
        className="text-sm font-semibold text-muted-foreground"
      >
        Effects
      </h2>
      <LabeledSlider
        label="Blur"
        value={fx.blur}
        min={BLUR.min}
        max={BLUR.max}
        step={BLUR.step}
        unit="px"
        defaultValue={defaultDesign.backgroundFx.blur}
        onChange={setBlur}
      />
    </section>
  );
}
