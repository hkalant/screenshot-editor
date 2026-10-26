"use client";

import { Redo2, Undo2 } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { currentPlatform, isApplePlatform } from "@/lib/platform";
import {
  selectCanRedo,
  selectCanUndo,
  useEditorStore,
} from "@/lib/store/editor";

const subscribe = () => () => {};

export function HistoryButtons() {
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const apple = useSyncExternalStore(
    subscribe,
    () => isApplePlatform(currentPlatform()),
    () => false,
  );

  return (
    <div className="flex items-center">
      <Button
        variant="ghost"
        size="bar-icon"
        onClick={undo}
        disabled={!canUndo}
        aria-label="Undo"
        data-tip={apple ? "Undo (⌘Z)" : "Undo (Ctrl+Z)"}
      >
        <Undo2 aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="bar-icon"
        onClick={redo}
        disabled={!canRedo}
        aria-label="Redo"
        data-tip={apple ? "Redo (⇧⌘Z)" : "Redo (Ctrl+Y)"}
      >
        <Redo2 aria-hidden />
      </Button>
    </div>
  );
}
