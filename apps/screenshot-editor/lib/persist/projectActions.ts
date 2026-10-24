import { originalImageId } from "@/lib/image/crop";
import { suggestedStem } from "@/lib/export/filename";
import {
  chooseSaveTarget,
  rememberedStem,
  rememberStem,
} from "@/lib/export/saveFile";
import { loadImageFromBlob } from "@/lib/image/load";
import { selectActiveImage, useEditorStore } from "@/lib/store/editor";
import { PROJECT_EXTENSION } from "@/lib/export/filename";
import {
  MAX_PROJECT_BYTES,
  parseProject,
  PROJECT_MESSAGES,
  ProjectError,
  serializeProject,
} from "./project";

export const PROJECT_OPENED =
  "Project opened. Undo brings back what you had before.";
export const PROJECT_SAVE_FAILED = "Couldn't save the project.";

let saving = false;

/**
 * Asks for a file name, then saves the design as a project file, to reopen
 * and keep editing later. Call it straight from the click or key press, for
 * the system Save dialog.
 */
export async function saveProject(): Promise<void> {
  const state = useEditorStore.getState();
  const image = selectActiveImage(state);
  if (saving || !image || state.loading || state.restoring) return;
  saving = true;
  try {
    const save = await chooseSaveTarget({
      title: "Save project",
      action: "Save",
      description:
        "Save your work as a project file so you can open it later and keep editing every annotation.",
      stem:
        rememberedStem(originalImageId(image.id)) ?? suggestedStem(image.name),
      extension: PROJECT_EXTENSION,
      mime: "application/json",
      typeLabel: "Screenshot Editor project",
      pickerExtension: ".json",
      alsoStrip: [".json"],
    });
    if (!save) return;
    rememberStem(originalImageId(image.id), save.stem);
    // The design as it is now, after the dialog.
    const now = useEditorStore.getState();
    const text = await serializeProject(now.design, now.images);
    await save.write(new Blob([text], { type: "application/json" }));
  } catch {
    useEditorStore.getState().showError(PROJECT_SAVE_FAILED);
  } finally {
    saving = false;
  }
}

let opening = 0;

/** Opens a project file in place of the current design (one undo step). */
export async function openProjectFile(file: File): Promise<void> {
  const attempt = ++opening;
  const store = useEditorStore.getState();
  if (file.size > MAX_PROJECT_BYTES) {
    store.showError(PROJECT_MESSAGES.tooLarge);
    return;
  }
  store.setLoading(true);
  try {
    const { design, images } = await parseProject(
      await file.text(),
      (blob, name) => loadImageFromBlob(blob, name),
    );
    if (attempt !== opening) {
      for (const image of images) image.release();
      return;
    }
    const state = useEditorStore.getState();
    state.openProject(design, images);
    state.showInfo(PROJECT_OPENED);
  } catch (error) {
    if (attempt === opening)
      useEditorStore
        .getState()
        .showError(
          error instanceof ProjectError
            ? error.message
            : PROJECT_MESSAGES.unreadable,
        );
  } finally {
    if (attempt === opening) useEditorStore.getState().setLoading(false);
  }
}

/**
 * Asks for a project file and opens it. Call it from a click or key handler:
 * browsers only show the file picker in response to one.
 */
export function pickProjectFile(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = `${PROJECT_EXTENSION},.json,application/json`;
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) void openProjectFile(file);
  });
  input.click();
}
