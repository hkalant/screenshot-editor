import { Button } from "@/components/ui/button";
import { defaultShotStyle } from "@/lib/design/defaults";
import { BORDER_WIDTH, PADDING } from "@/lib/design/limits";
import type { ShadowPresetId } from "@/lib/design/schema";
import { SHADOW_LABELS, SHADOW_PRESET_ORDER } from "@/lib/design/shadows";
import { selectShot, useEditorStore } from "@/lib/store/editor";
import { cn } from "@/lib/utils";
import { ColorField } from "../controls/ColorField";
import { LabeledSlider } from "../controls/LabeledSlider";
import { Segmented } from "../controls/Segmented";
import { FrameOptions } from "./FramePanel";

const SHADOW_OPTIONS = SHADOW_PRESET_ORDER.map((id) => ({
  value: id,
  label: SHADOW_LABELS[id],
}));

const percent = (value: number) => Math.round(value * 100);

/** Where the sliders go back to when their thumb is double-clicked. */
const defaults = defaultShotStyle();

/** A browser or window frame, and the space around the screenshot. */
export function FrameSettings() {
  const padding = useEditorStore((state) => selectShot(state).padding);
  const setPadding = useEditorStore((state) => state.setPadding);
  return (
    <>
      <FrameOptions />
      <LabeledSlider
        label="Padding"
        value={padding}
        min={PADDING.min}
        max={PADDING.max}
        step={PADDING.step}
        unit="px"
        defaultValue={defaults.padding}
        onChange={setPadding}
      />
    </>
  );
}

export function ShadowSettings() {
  const preset = useEditorStore((state) => selectShot(state).shadow.preset);
  const setShadowPreset = useEditorStore((state) => state.setShadowPreset);
  return (
    // No option is on while the shadow is hand-tuned ("custom").
    <Segmented<ShadowPresetId | "custom">
      label="Shadow"
      hideLabel
      glide
      value={preset}
      options={SHADOW_OPTIONS}
      onChange={setShadowPreset}
    />
  );
}

export function BorderSettings() {
  const border = useEditorStore((state) => selectShot(state).border);
  const setBorder = useEditorStore((state) => state.setBorder);
  return (
    <>
      <LabeledSlider
        label="Border width"
        value={border.width}
        min={BORDER_WIDTH.min}
        max={BORDER_WIDTH.max}
        step={BORDER_WIDTH.step}
        unit="px"
        defaultValue={defaults.border.width}
        onChange={(width) => setBorder({ width })}
      />
      <LabeledSlider
        label="Border opacity"
        value={percent(border.opacity)}
        min={0}
        max={100}
        unit="%"
        defaultValue={percent(defaults.border.opacity)}
        onChange={(value) => setBorder({ opacity: value / 100 })}
      />
      <ColorField
        label="Border colour"
        value={border.color}
        onChange={(color) => setBorder({ color })}
      />
    </>
  );
}

export function ResetStyleButton({ className }: { className?: string }) {
  const resetStyle = useEditorStore((state) => state.resetStyle);
  return (
    <Button
      variant="outline"
      className={cn("w-full", className)}
      onClick={resetStyle}
    >
      Reset style
    </Button>
  );
}

/** The style sections, in order: the sidebar's accordions and the Style tab. */
export const STYLE_SECTIONS = [
  { id: "frame", title: "Frame", Component: FrameSettings },
  { id: "shadow", title: "Shadow", Component: ShadowSettings },
  { id: "border", title: "Border", Component: BorderSettings },
] as const;

/** The Style tab of the mobile layout: every style section, one after another. */
export function StylePanel() {
  return (
    <div className="space-y-8">
      {STYLE_SECTIONS.map(({ id, title, Component }) => (
        <div key={id} className="space-y-5">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {title}
          </h2>
          <Component />
        </div>
      ))}
      <ResetStyleButton />
    </div>
  );
}
