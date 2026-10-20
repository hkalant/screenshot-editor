import { Palette, SlidersHorizontal } from "lucide-react";
import type { ComponentType } from "react";
import type { PanelId } from "@/lib/store/editor";
import { BackgroundPanel } from "./BackgroundPanel";
import { StylePanel } from "./StylePanel";

/** The settings panels of the mobile tabs. The desktop sidebar shows the same settings as sections. */
export const PANELS: readonly {
  id: PanelId;
  label: string;
  icon: typeof Palette;
  Component: ComponentType;
}[] = [
  {
    id: "background",
    label: "Background",
    icon: Palette,
    Component: BackgroundPanel,
  },
  {
    id: "style",
    label: "Style",
    icon: SlidersHorizontal,
    Component: StylePanel,
  },
];
