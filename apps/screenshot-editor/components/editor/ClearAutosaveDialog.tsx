"use client";

import { Dialog } from "radix-ui";
import { create } from "zustand";
import { Button } from "@/components/ui/button";
import { clearAutosavedWork } from "@/lib/hooks/useAutosave";
import { saveProject } from "@/lib/persist/projectActions";
import { selectActiveImage, useEditorStore } from "@/lib/store/editor";

/** Whether the question before clearing the autosaved work is open. */
export const useClearAutosaveStore = create<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>()((set) => ({ open: false, setOpen: (open) => set({ open }) }));

/**
 * Asks before clearing the autosaved work, which can't be undone: the
 * screenshots and edits this browser keeps go, and the editor starts blank.
 */
export function ClearAutosaveDialog() {
  const open = useClearAutosaveStore((state) => state.open);
  const setOpen = useClearAutosaveStore((state) => state.setOpen);
  const hasImage = useEditorStore((state) => !!selectActiveImage(state));

  const clear = async () => {
    setOpen(false);
    const cleared = await clearAutosavedWork();
    const { showInfo, showError } = useEditorStore.getState();
    if (cleared) showInfo("Autosaved work cleared from this browser.");
    else showError("Couldn't clear the autosaved work.");
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="tour-fade fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content
          data-testid="clear-autosave-dialog"
          className="tour-pop fixed top-1/2 left-1/2 z-51 w-[min(28rem,calc(100vw-2rem))] -translate-1/2 rounded-xl bg-background p-6 text-foreground shadow-2xl outline-none"
        >
          <Dialog.Title className="text-lg font-semibold">
            Clear autosaved work?
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-sm text-muted-foreground">
            This deletes the screenshots and edits this browser keeps between
            visits, and starts the editor again from blank. It can&apos;t be
            undone. To keep a copy, save the project first.
          </Dialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Dialog.Close>
            {/* Saving keeps the work; this question stays open for the clear. */}
            <Button
              type="button"
              disabled={!hasImage}
              onClick={() => void saveProject()}
            >
              Save project
            </Button>
            <Button
              type="button"
              className="bg-[#C70540] text-white"
              onClick={() => void clear()}
            >
              Clear autosaved work
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
