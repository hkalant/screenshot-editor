"use client";

import { useEffect, useEffectEvent } from "react";
import { annotationInPaste, pasteAnnotation } from "@/lib/annotationClipboard";
import { isEditableTarget } from "@/lib/dom";
import { useEditorStore } from "@/lib/store/editor";

/**
 * Calls `onFiles` with the files in any paste that is not aimed at a text
 * field. A copied annotation is pasted onto the design instead.
 */
export function useWindowPaste(onFiles: (files: File[]) => void) {
  const handleFiles = useEffectEvent(onFiles);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const data = event.clipboardData;
      if (!data) return;
      const annotation = annotationInPaste(data);
      if (annotation && useEditorStore.getState().design.layers[0].imageId) {
        event.preventDefault();
        pasteAnnotation(annotation);
        return;
      }
      let files = Array.from(data.files);
      if (files.length === 0) {
        files = Array.from(data.items)
          .filter((item) => item.kind === "file")
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null);
      }
      if (files.length === 0) return;
      event.preventDefault();
      handleFiles(files);
    };
    // Cancelling beforepaste lets some browsers (older Safari) offer Paste when
    // nothing editable is focused. It has no effect elsewhere.
    const onBeforePaste = (event: Event) => {
      if (!isEditableTarget(event.target)) event.preventDefault();
    };
    window.addEventListener("paste", onPaste);
    document.addEventListener("beforepaste", onBeforePaste);
    return () => {
      window.removeEventListener("paste", onPaste);
      document.removeEventListener("beforepaste", onBeforePaste);
    };
  }, []);
}
