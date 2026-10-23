"use client";

import { useEffect, useEffectEvent } from "react";
import {
  copyAnnotation,
  pasteAnnotation,
  writeCopiedAnnotation,
} from "@/lib/annotationClipboard";
import { isEditableTarget } from "@/lib/dom";
import { runCopy, runExport } from "@/lib/export/controller";
import { currentPlatform, isApplePlatform } from "@/lib/platform";
import {
  matchShortcut,
  shortcutApplies,
  type ShortcutContext,
} from "@/lib/shortcuts";
import { selectSelectedAnnotation, useEditorStore } from "@/lib/store/editor";
import { pickProjectFile, saveProject } from "@/lib/persist/projectActions";
import { runShowShortcuts } from "@/lib/shortcutsCommand";
import { runZoom } from "@/lib/zoomCommands";

/** Marks the focusable element around the design stage (arrow keys nudge there). */
export const CANVAS_FOCUS_ATTRIBUTE = "data-design-canvas";

function focusContext(event: KeyboardEvent): ShortcutContext {
  const active = document.activeElement;
  const focus =
    active instanceof Element && active.closest(`[${CANVAS_FOCUS_ATTRIBUTE}]`)
      ? "canvas"
      : !active ||
          active === document.body ||
          active === document.documentElement
        ? "page"
        : "other";
  const selection = window.getSelection();
  return {
    editable: isEditableTarget(event.target),
    hasSelection:
      !!selection && !selection.isCollapsed && selection.toString() !== "",
    focus,
  };
}

/** Undo, redo, export, copy, duplicate, open, delete, escape, nudge, zoom and the shortcuts list from the keyboard. */
export function useShortcuts({ onOpen }: { onOpen: () => void }) {
  const open = useEffectEvent(onOpen);

  useEffect(() => {
    const apple = isApplePlatform(currentPlatform());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const command = matchShortcut(event, apple);
      if (!command || !shortcutApplies(command, focusContext(event))) return;
      const state = useEditorStore.getState();
      switch (command.type) {
        case "undo":
          state.undo();
          break;
        case "redo":
          state.redo();
          break;
        case "export":
          void runExport();
          break;
        case "copy": {
          // The selected annotation, else the image. The browser's copy
          // event that follows puts the annotation on the clipboard.
          const selected = selectSelectedAnnotation(state);
          if (selected) {
            copyAnnotation(selected);
            return;
          }
          runCopy();
          break;
        }
        case "duplicate": {
          const selected = selectSelectedAnnotation(state);
          if (selected) pasteAnnotation(selected);
          // Even with nothing selected: not the browser's bookmark.
          break;
        }
        case "open":
          open();
          break;
        case "delete": {
          // The selected annotation first, then the screenshot.
          const selected = selectSelectedAnnotation(state);
          if (selected) state.removeAnnotation(selected.id);
          else if (state.design.layers[0].imageId) state.clearImage();
          else return;
          break;
        }
        case "escape":
          // Deselect, then put the drawing tool down.
          if (state.selectedAnnotationId) state.selectAnnotation(null);
          else if (state.annotationTool !== "select")
            state.setAnnotationTool("select");
          else return;
          break;
        case "zoom":
          // Without a design on screen the browser zooms the page as usual.
          if (!runZoom(command.direction)) return;
          break;
        case "saveProject":
          void saveProject();
          break;
        case "openProject":
          pickProjectFile();
          break;
        case "shortcuts":
          if (!runShowShortcuts()) return;
          break;
        case "nudge": {
          const selected = selectSelectedAnnotation(state);
          if (selected)
            state.nudgeAnnotation(selected.id, command.dx, command.dy);
          else if (state.design.canvas.preset === "auto") return;
          else state.nudge(command.dx, command.dy);
          break;
        }
      }
      event.preventDefault();
    };
    const onCopy = (event: ClipboardEvent) => {
      if (writeCopiedAnnotation(event)) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("copy", onCopy);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("copy", onCopy);
    };
  }, []);
}
