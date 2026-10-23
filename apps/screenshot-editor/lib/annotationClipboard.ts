import { annotationSchema, type Annotation } from "@/lib/design/schema";
import { useEditorStore } from "@/lib/store/editor";

// Copying and pasting annotations. A copy goes on the system clipboard (in a
// type of its own, beside an empty text, so a screenshot copied earlier
// isn't pasted instead), and is kept here for browsers that only allow a
// copy when text is selected.

const MIME = "application/x-screenshot-editor-annotation";

let copied: Annotation | null = null;
/** A copy waiting for the browser's copy event. */
let pending: Annotation | null = null;
/** The copy last pasted, and what it was pasted from: pasting again goes on from it. */
let last: { from: string; id: string } | null = null;

/** Copies `annotation` now, and onto the system clipboard if the browser allows it. */
export function copyAnnotation(annotation: Annotation) {
  copied = annotation;
  pending = annotation;
  last = null;
}

/** For the copy event a copy shortcut starts: puts the pending copy on the clipboard. */
export function writeCopiedAnnotation(event: ClipboardEvent): boolean {
  const annotation = pending;
  pending = null;
  if (!annotation || !event.clipboardData) return false;
  event.clipboardData.setData(MIME, JSON.stringify(annotation));
  event.clipboardData.setData("text/plain", "");
  return true;
}

/** The copied annotation in a paste, or the one copied here when the paste has nothing. */
export function annotationInPaste(data: DataTransfer): Annotation | null {
  const text = data.getData(MIME);
  if (text) {
    try {
      const parsed = annotationSchema.safeParse(JSON.parse(text));
      if (parsed.success) return parsed.data;
    } catch {
      // Not ours after all.
    }
    return null;
  }
  const empty =
    data.files.length === 0 &&
    Array.from(data.items).every(
      (item) => item.kind !== "file" && item.type !== "text/plain",
    );
  return empty ? copied : null;
}

/** Pastes a copy of `annotation`, a step on from the copy pasted before it. */
export function pasteAnnotation(annotation: Annotation) {
  const state = useEditorStore.getState();
  const previous =
    last?.from === annotation.id
      ? state.design.annotations.find((item) => item.id === last?.id)
      : undefined;
  const id = state.pasteAnnotation(previous ?? annotation);
  if (id) last = { from: annotation.id, id };
}
