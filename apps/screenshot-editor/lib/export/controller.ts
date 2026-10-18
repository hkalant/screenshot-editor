import type Konva from "konva";
import { computeLayout } from "@/lib/design/layout";
import { selectActiveImage, useEditorStore } from "@/lib/store/editor";
import {
  canCopyImages,
  copyPngToClipboard,
  downloadBlob,
  exportDesign,
  nextPaint,
  renderDesignBlob,
  type RenderTarget,
} from "./exportImage";
import { originalFilename } from "./filename";

// Export and copy are started from the top bar, the mobile bar and keyboard
// shortcuts, so the stage registers itself here instead of being passed around.
let stageTarget: { stage: Konva.Stage; layer: Konva.Layer } | null = null;

/** Called by the design stage when it mounts. Returns the unregister function. */
export function registerExportStage(
  stage: Konva.Stage,
  layer: Konva.Layer,
): () => void {
  const target = { stage, layer };
  stageTarget = target;
  return () => {
    if (stageTarget === target) stageTarget = null;
  };
}

export const EXPORT_FAILED = "Export failed. Try a smaller size or scale.";
export const COPY_FAILED = "Couldn't copy the image. Use Export instead.";
export const COPIED = "Copied!";

// Copy buttons show their own "Copied" tooltip; the notice is the fallback
// when none is mounted.
const copiedListeners = new Set<() => void>();

/** Calls `listener` after each successful copy. Returns the unsubscribe function. */
export function onCopied(listener: () => void): () => void {
  copiedListeners.add(listener);
  return () => {
    copiedListeners.delete(listener);
  };
}

/** The stage and design size as they are right now, or null if there's nothing to render. */
function currentTarget(): (RenderTarget & { sourceName: string }) | null {
  const state = useEditorStore.getState();
  const image = selectActiveImage(state);
  if (state.loading || state.restoring || !image || !stageTarget) return null;
  return {
    ...stageTarget,
    size: computeLayout(image, state.design).canvas,
    sourceName: image.name,
  };
}

const fontsReady = () =>
  typeof document !== "undefined" && document.fonts
    ? document.fonts.ready.then(() => undefined)
    : Promise.resolve();

let exporting = false;

/**
 * Exports with the current options. Ignored while an export runs or an image
 * loads. True if the file was written.
 */
export async function runExport(): Promise<boolean> {
  const initial = useEditorStore.getState();
  if (exporting || !currentTarget()) return false;
  exporting = true;
  initial.setExporting(true);
  try {
    // Let the disabled button paint, and frame text use the real font.
    await nextPaint();
    await fontsReady();
    // Read everything after the waits, so the size, the file name and the
    // drawn canvas all describe the same design.
    const target = currentTarget();
    if (!target) return false;
    await exportDesign(
      target,
      useEditorStore.getState().exportOptions,
      target.sourceName,
    );
    return true;
  } catch {
    useEditorStore.getState().showError(EXPORT_FAILED);
    return false;
  } finally {
    exporting = false;
    useEditorStore.getState().setExporting(false);
  }
}

/**
 * Downloads the screenshot exactly as it was imported or pasted: the same
 * file, with no background, frame, annotations or resizing, so the user can
 * start over without hunting for it. False if there is no screenshot.
 */
export function downloadOriginal(): boolean {
  const image = selectActiveImage(useEditorStore.getState());
  if (!image) return false;
  downloadBlob(image.blob, originalFilename(image.name, image.blob.type));
  return true;
}

/** Exports the design, then downloads the original screenshot beside it. */
export async function runExportBoth(): Promise<void> {
  // Only when the export went through (it shows its own error otherwise).
  if (await runExport()) downloadOriginal();
}

/**
 * Copies the design as a PNG at the current export scale. Call it directly
 * from a click or key handler: the clipboard write has to start in the gesture.
 */
export function runCopy(): void {
  const { showError, showInfo, exporting: busy } = useEditorStore.getState();
  if (busy || !currentTarget()) return;
  if (!canCopyImages()) {
    showError(COPY_FAILED);
    return;
  }
  copyPngToClipboard(async () => {
    await fontsReady();
    const target = currentTarget();
    if (!target) throw new Error("Nothing to copy");
    const { scale, quality } = useEditorStore.getState().exportOptions;
    const { blob } = await renderDesignBlob(target, {
      format: "png",
      quality,
      scale,
    });
    return blob;
  }).then(
    () => {
      if (copiedListeners.size === 0) showInfo(COPIED);
      else copiedListeners.forEach((listener) => listener());
    },
    () => showError(COPY_FAILED),
  );
}
