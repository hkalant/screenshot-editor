import { DEFAULT_GRADIENT } from "./gradients";
import { PADDING, RADIUS, ROTATION, SHOT_SCALE } from "./limits";
import type { Background, Design, ShotStyle } from "./schema";
import { DEFAULT_SHADOW, SHADOW_PRESETS } from "./shadows";
import { DEFAULT_SIZE_PRESET } from "./sizes";

export const SHOT_LAYER_ID = "shot-1";

export function defaultBackground(): Background {
  return {
    kind: "linear",
    presetId: DEFAULT_GRADIENT.id,
    angle: DEFAULT_GRADIENT.angle,
    stops: DEFAULT_GRADIENT.stops.map((stop) => ({ ...stop })),
  };
}

/** Every style setting of the screenshot layer, as "Reset style" restores them. */
export function defaultShotStyle(): ShotStyle {
  return {
    padding: PADDING.default,
    scale: SHOT_SCALE.default,
    position: { x: 0.5, y: 0.5 },
    rotation: ROTATION.default,
    radius: RADIUS.default,
    shadow: { ...SHADOW_PRESETS[DEFAULT_SHADOW] },
    border: { width: 10, color: "#ffffff", opacity: 0.3 },
    frame: { kind: "none", theme: "light", title: "", url: "" },
  };
}

export function createDefaultDesign(): Design {
  return {
    version: 2,
    canvas: {
      preset: DEFAULT_SIZE_PRESET.id,
      width: DEFAULT_SIZE_PRESET.width,
      height: DEFAULT_SIZE_PRESET.height,
    },
    background: defaultBackground(),
    backgroundFx: { blur: 0 },
    layers: [
      {
        id: SHOT_LAYER_ID,
        kind: "shot",
        imageId: null,
        crop: null,
        ...defaultShotStyle(),
      },
    ],
    annotations: [],
    nextStep: 1,
  };
}
