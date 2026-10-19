import type Konva from "konva";
import { computeLayout } from "@/lib/design/layout";
import { selectActiveImage, useEditorStore } from "@/lib/store/editor";
import {
  canCopyImages,
  copyPngToClipboard,
  canEncode,
  downloadBlob,
  nextPaint,
  planExport,
  renderDesignBlob,
  type RenderTarget,
} from "./exportImage";
import { originalFilename, suggestedStem } from "./filename";
import { FORMAT_INFO } from "./options";
import { chooseSaveTarget, rememberedStem, rememberStem } from "./saveFile";

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
function currentTarget():
  (RenderTarget & { sourceName: string; imageId: string }) | null {
  const state = useEditorStore.getState();
  const image = selectActiveImage(state);
  if (state.loading || state.restoring || !image || !stageTarget) return null;
  return {
    ...stageTarget,
    size: computeLayout(image, state.design).canvas,
    sourceName: image.name,
    imageId: image.id,
  };
}

const fontsReady = () =>
  typeof document !== "undefined" && document.fonts
    ? document.fonts.ready.then(() => undefined)
    : Promise.resolve();

let exporting = false;

/**
 * Asks for a file name, then exports with the current options. Call it
 * straight from the click or key press, for the system Save dialog. Ignored
 * while an export runs or an image loads. True if the file was written.
 */
export async function runExport(): Promise<boolean> {
  const initial = useEditorStore.getState();
  const chosen = currentTarget();
  if (exporting || !chosen) return false;
  exporting = true;
  try {
    const options = initial.exportOptions;
    // A browser that can't encode the format writes PNG instead; name it so.
    const requested = FORMAT_INFO[options.format];
    const format = canEncode(requested.mime) ? options.format : "png";
    const info = FORMAT_INFO[format];
    const { pixels } = planExport(chosen.size, options.scale);
    const save = await chooseSaveTarget({
      title: "Export image",
      action: "Export",
      description: `${info.label} at ${options.scale}×, ${pixels.width} × ${pixels.height}.`,
      stem: rememberedStem(chosen.imageId) ?? suggestedStem(chosen.sourceName),
      extension: `.${info.extension}`,
      mime: info.mime,
      typeLabel: `${info.label} image`,
      alsoStrip: [".png", ".jpg", ".jpeg", ".webp"],
    });
    if (!save) return false;
    rememberStem(chosen.imageId, save.stem);
    useEditorStore.getState().setExporting(true);
    // Let the disabled button paint, and frame text use the real font.
    await nextPaint();
    await fontsReady();
    // Read the design after the waits, so the size and the drawn canvas
    // describe the same moment.
    const target = currentTarget();
    if (!target) return false;
    const { blob } = await renderDesignBlob(target, {
      ...useEditorStore.getState().exportOptions,
      format,
    });
    await save.write(blob);
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

const BOTH_GAP_MS = 300;

/** Exports the design, then downloads the original screenshot beside it. */
export async function runExportBoth(): Promise<void> {
  // Only when the export went through (it shows its own error otherwise).
  if (!(await runExport())) return;
  // A moment apart: Safari can drop a download that starts in the same
  // instant as the one before.
  await new Promise((resolve) => window.setTimeout(resolve, BOTH_GAP_MS));
  downloadOriginal();
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
