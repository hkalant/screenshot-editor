import { Line } from "react-konva";
import { create } from "zustand";
import type { Size } from "@/lib/design/layout";
import { EXPORT_HIDDEN } from "@/lib/export/exportImage";
import { NO_GUIDES, type CentreGuides } from "@/lib/render/snap";

/** The centre lines shown while a dragged shot is snapped to them. Not part of the design. */
export const useGuides = create<CentreGuides>()(() => ({ ...NO_GUIDES }));

// Brookes pink: a primary colour that stands out on most designs.
export const GUIDE_COLOR = "#d10373";

type Props = {
  canvas: Size;
  /** On-screen zoom of the stage, so guide lines stay 1 screen px wide. */
  zoom: number;
};

export function GuidesNode({ canvas, zoom }: Props) {
  const vertical = useGuides((state) => state.vertical);
  const horizontal = useGuides((state) => state.horizontal);
  const { width, height } = canvas;
  const line = {
    stroke: GUIDE_COLOR,
    strokeWidth: 1 / zoom,
    listening: false,
    // Exports leave these out.
    name: EXPORT_HIDDEN,
  };
  return (
    <>
      {vertical && (
        <Line points={[width / 2, 0, width / 2, height]} {...line} />
      )}
      {horizontal && (
        <Line points={[0, height / 2, width, height / 2]} {...line} />
      )}
    </>
  );
}
