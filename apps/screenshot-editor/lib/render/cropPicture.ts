import type Konva from "konva";
import { computeLayout } from "@/lib/design/layout";
import { currentStage } from "@/lib/export/controller";
import { EXPORT_HIDDEN } from "@/lib/export/exportImage";
import { selectActiveImage, useEditorStore } from "@/lib/store/editor";

/** The name of the group of all the annotations, from the screenshot's top-left. */
export const ANNOTATIONS_ROOT = "annotations-root";

/** The annotations as a picture, and where it goes, in image widths. */
export type CropPicture = {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  width: number;
  height: number;
};

let picture: CropPicture | null = null;

/** The picture taken when cropping started, if there was one. */
export const cropPicture = () => picture;

/**
 * Takes a picture of the annotations as they are on screen, for crop mode
 * to show over the whole screenshot. None when there are none, or when the
 * screenshot is rotated (it wouldn't line up).
 */
export function takeCropPicture(): void {
  picture = null;
  const state = useEditorStore.getState();
  const image = selectActiveImage(state);
  const stage = currentStage();
  if (
    !image ||
    !stage ||
    state.design.annotations.length === 0 ||
    state.design.layers[0].rotation !== 0
  )
    return;
  const root = stage.findOne<Konva.Group>(`.${ANNOTATIONS_ROOT}`);
  if (!root) return;
  const unit = computeLayout(image, state.design).shot.image.width;
  const hidden = root
    .find(`.${EXPORT_HIDDEN}`)
    .filter((node) => node.visible());
  for (const node of hidden) node.visible(false);
  try {
    const box = root.getClientRect({ relativeTo: root });
    if (box.width <= 0 || box.height <= 0) return;
    // Sharp enough for the crop view, which shows the screenshot smaller.
    const ratio = Math.min(2, 4096 / Math.max(box.width, box.height));
    const canvas = root.toCanvas({ pixelRatio: ratio / stage.scaleX() });
    picture = {
      canvas,
      x: box.x / unit,
      y: box.y / unit,
      width: box.width / unit,
      height: box.height / unit,
    };
  } catch {
    // A picture is a nicety; crop without one.
  } finally {
    for (const node of hidden) node.visible(true);
  }
}
