import { useEditorStore } from "@/lib/store/editor";
import { IMAGE_MESSAGES, validateImageFile } from "./accept";
import { ImageLoadError, loadImageFromBlob, type LoadedImage } from "./load";

/** Where an incoming image goes: the screenshot, an uploaded background, or a second screenshot. */
export type IngestTarget = "shot" | "background" | "inset";

// Every attempt to bring in an image gets a number, per target. Only the newest
// attempt may change the store, so a slow decode can't overwrite an image
// added after it.
const latestAttempt: Record<IngestTarget, number> = {
  shot: 0,
  background: 0,
  inset: 0,
};

// The store has one loading flag (export waits for it), so it stays on while
// either target is still loading.
const busy: Record<IngestTarget, boolean> = {
  shot: false,
  background: false,
  inset: false,
};

function setBusy(target: IngestTarget, value: boolean) {
  busy[target] = value;
  useEditorStore
    .getState()
    .setLoading(busy.shot || busy.background || busy.inset);
}

function messageFor(error: unknown): string {
  if (error instanceof ImageLoadError && error.reason === "tooManyPixels")
    return IMAGE_MESSAGES.tooManyPixels;
  return IMAGE_MESSAGES.unreadable;
}

function apply(target: IngestTarget, image: LoadedImage) {
  const state = useEditorStore.getState();
  if (target === "shot") state.setImage(image);
  else if (target === "background") state.setBackgroundImage(image);
  else state.addScreenshot(image);
}

async function ingest(
  target: IngestTarget,
  load: () => Promise<LoadedImage>,
  failureMessage?: string,
): Promise<void> {
  const attempt = ++latestAttempt[target];
  const isLatest = () => attempt === latestAttempt[target];
  const { showError } = useEditorStore.getState();
  setBusy(target, true);
  try {
    const image = await load();
    if (!isLatest()) {
      image.release();
      return;
    }
    apply(target, image);
  } catch (error) {
    if (isLatest()) showError(failureMessage ?? messageFor(error));
  } finally {
    if (isLatest()) setBusy(target, false);
  }
}

/**
 * Validates and loads a file from the picker, a paste or a drop. Replaces the
 * screenshot, or with target "background" the background image; target
 * "inset" adds a second screenshot.
 */
export function ingestFile(
  file: File,
  target: IngestTarget = "shot",
): Promise<void> {
  const check = validateImageFile(file);
  if (!check.ok) {
    latestAttempt[target] += 1; // a newer action: drop any load still in flight
    setBusy(target, false);
    useEditorStore.getState().showError(check.message);
    return Promise.resolve();
  }
  return ingest(target, () => loadImageFromBlob(file, file.name));
}

export function ingestSample(
  url: string,
  name = "sample-screenshot.jpg",
): Promise<void> {
  return ingest(
    "shot",
    async () => {
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`Sample image request failed: ${response.status}`);
      return loadImageFromBlob(await response.blob(), name);
    },
    IMAGE_MESSAGES.sampleFailed,
  );
}
