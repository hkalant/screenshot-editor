"use client";

import { FolderOpen, Save } from "lucide-react";
import { pickProjectFile, saveProject } from "@/lib/persist/projectActions";
import { selectActiveImage, useEditorStore } from "@/lib/store/editor";
import { cn } from "@/lib/utils";
import { itemClass } from "./HelpMenu";
import { MenuShortcut } from "./ShortcutList";

/**
 * Open project and Save project, for a menu. A project keeps every
 * annotation editable; `shortcuts` shows their keys (null hides them).
 */
export function ProjectItems({
  onPick,
  shortcuts,
}: {
  onPick: () => void;
  shortcuts: { save: string; open: string } | null;
}) {
  const hasImage = useEditorStore((state) => !!selectActiveImage(state));
  const busy = useEditorStore((state) => state.loading || state.restoring);
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        className={itemClass}
        disabled={busy}
        onClick={() => {
          onPick();
          pickProjectFile();
        }}
      >
        <span className="flex w-5 justify-center text-muted-foreground">
          <FolderOpen className="size-4" aria-hidden />
        </span>
        Open project…
        {shortcuts && <MenuShortcut keys={shortcuts.open} />}
      </button>
      <button
        type="button"
        className={cn(
          itemClass,
          "disabled:pointer-events-none disabled:opacity-50",
        )}
        disabled={!hasImage || busy}
        data-tip="Download a file you can reopen to keep editing"
        onClick={() => {
          onPick();
          void saveProject();
        }}
      >
        <span className="flex w-5 justify-center text-muted-foreground">
          <Save className="size-4" aria-hidden />
        </span>
        Save project
        {shortcuts && <MenuShortcut keys={shortcuts.save} />}
      </button>
    </div>
  );
}
