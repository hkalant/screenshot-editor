"use client";

import { useLayoutEffect } from "react";
import { createDefaultDesign } from "@/lib/design/defaults";
import { loadImageFromBlob } from "@/lib/image/load";
import {
  DESIGN_KEY,
  newerSavedDesign,
  restoreSnapshot,
  saveSnapshot,
  saveSnapshotNow,
  type AutosaveStorage,
  type SavedDesign,
} from "@/lib/persist/autosave";
import {
  readJsonPreference,
  removePreference,
  writePreference,
} from "@/lib/persist/preferences";
import {
  clearValues,
  deleteValue,
  listKeys,
  readValue,
  writeNow,
  writeValue,
} from "@/lib/persist/storage";
import { useEditorStore } from "@/lib/store/editor";
import { designUnderTour } from "@/lib/tour/tour";

const SAVE_DELAY_MS = 600;
// Steady editing (typing a title) still saves at least this often.
const SAVE_MAX_WAIT_MS = 3000;
// A storage that never answers (a stuck IndexedDB open) must not keep the
// editor on "Restoring…" for good.
const RESTORE_READ_TIMEOUT_MS = 5000;

// A copy of the design written to localStorage as the page closes. The
// IndexedDB write started then can be lost (WebKit drops it on a quick
// reload); localStorage writes at once. Images aren't copied: they are
// saved soon after they are added, and one that is missing is dropped.
const PENDING_KEY = "pending-design";

const storage: AutosaveStorage = {
  read: readValue,
  write: writeValue,
  remove: deleteValue,
  keys: listKeys,
  writeNow,
};

// Off for the rest of the page's life once a save fails (private windows,
// blocked or full storage) or storage stops answering.
let storageWorks = true;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error("Storage did not answer")),
      ms,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const readWithTimeout = <T>(key: string) =>
  withTimeout(readValue<T>(key), RESTORE_READ_TIMEOUT_MS).catch(
    (error: unknown) => {
      storageWorks = false;
      throw error;
    },
  );

// True when the restore used the localStorage copy, which storage doesn't
// hold yet: the editor then saves it once.
let restoredFromCopy = false;

const restoreStorage: AutosaveStorage = {
  ...storage,
  read: async <T>(key: string) => {
    if (key !== DESIGN_KEY) return readWithTimeout<T>(key);
    const pending = readJsonPreference(PENDING_KEY);
    const stored = await readWithTimeout<SavedDesign>(key).catch(
      (error: unknown) => {
        // Storage stopped answering: the copy is still worth restoring.
        if (pending === null) throw error;
        return undefined;
      },
    );
    const newer = newerSavedDesign(stored, pending);
    restoredFromCopy = newer !== undefined && newer === pending;
    return newer as T | undefined;
  },
};

// The store outlives the editor page (client-side navigation keeps it), so
// the saved design is read once per page load, never over a live design.
// It resolves to the revision whose design matches storage: the restored
// design, or the untouched default when nothing was saved. -1 when the user
// changed something during the restore, so that change gets saved.
let restoration: Promise<number> | null = null;

function restoreOnce(): Promise<number> {
  restoration ??= (async () => {
    const store = useEditorStore;
    const startRevision = store.getState().revision;
    store.getState().setRestoring(true);
    const restored = await restoreSnapshot(
      restoreStorage,
      loadImageFromBlob,
    ).catch(() => null);
    const state = store.getState();
    const untouched = state.revision === startRevision;
    // Keep what the user did while the restore was running.
    if (restored && untouched)
      state.loadDesign(restored.design, restored.images);
    else for (const image of restored?.images ?? []) image.release();
    store.getState().setRestoring(false);
    // -1 also when the copy was restored, so storage gets it.
    return untouched && !restoredFromCopy ? store.getState().revision : -1;
  })();
  return restoration;
}

/**
 * Clears the autosaved work: the editor starts over with a blank design and
 * no undo history, and the design and images this browser keeps are deleted.
 * The blank design is then saved as usual, and that save deletes any image a
 * save already under way writes after the clear. Preferences such as the
 * theme stay. False if the stored work could not be deleted.
 */
export async function clearAutosavedWork(): Promise<boolean> {
  const state = useEditorStore.getState();
  state.loadDesign(createDefaultDesign(), []);
  state.pruneImages();
  removePreference(PENDING_KEY);
  return clearValues();
}

/**
 * Restores the last design on startup, then saves the design and its images
 * to IndexedDB shortly after every change, and at once when the page is
 * hidden or closed. Without working storage the editor simply runs without
 * autosave.
 */
export function useAutosave() {
  // A layout effect, so "Restoring…" shows from the first paint.
  useLayoutEffect(() => {
    const store = useEditorStore;
    let disposed = false;
    let timer: number | undefined;
    // When the oldest change not yet saved was made.
    let waitingSince: number | undefined;
    let saving = false;
    let pendingSave = false;
    // The newest revision known to be in storage (or committed to it).
    let writtenRevision = -1;
    // The revision of the copy in localStorage, if there is one.
    let pendingRevision = -1;
    let unsubscribe: (() => void) | undefined;

    // The design to keep: the user's own, even while the tour shows the sample.
    const savedDesign = () => designUnderTour() ?? store.getState().design;

    const save = async () => {
      window.clearTimeout(timer);
      timer = undefined;
      waitingSince = undefined;
      if (!storageWorks) return;
      if (saving) {
        pendingSave = true;
        return;
      }
      saving = true;
      const { images, revision } = store.getState();
      const design = savedDesign();
      // A flush while this save waits may have written a newer design.
      const isCurrent = () => revision >= writtenRevision;
      if (await saveSnapshot(storage, design, images, isCurrent)) {
        writtenRevision = Math.max(writtenRevision, revision);
        // Storage now holds the copy's design or a newer one.
        if (pendingRevision >= 0 && revision >= pendingRevision) {
          removePreference(PENDING_KEY);
          pendingRevision = -1;
        }
      } else storageWorks = false;
      saving = false;
      if (pendingSave) {
        pendingSave = false;
        void save();
      }
    };

    const schedule = () => {
      const now = performance.now();
      waitingSince ??= now;
      window.clearTimeout(timer);
      const delay = Math.min(
        SAVE_DELAY_MS,
        Math.max(0, waitingSince + SAVE_MAX_WAIT_MS - now),
      );
      timer = window.setTimeout(() => void save(), delay);
    };

    // The page is being hidden or closed: write any unsaved change now. A
    // closing page never gets the replies saveSnapshot waits for, so the
    // design goes in one write committed straight away, and then the full
    // save runs too in case the page stays (a tab switch).
    const flush = () => {
      const { images, revision } = store.getState();
      const design = savedDesign();
      if (!storageWorks || revision <= writtenRevision) return;
      const copy: SavedDesign = { design, savedAt: Date.now() };
      writePreference(PENDING_KEY, JSON.stringify(copy));
      pendingRevision = revision;
      if (saveSnapshotNow(storage, design, images)) writtenRevision = revision;
      void save();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };

    void restoreOnce().then((cleanRevision) => {
      if (disposed) return;
      // A tab that only shows what storage holds never writes it back, so it
      // can't overwrite another tab's newer work when it is hidden or closed.
      writtenRevision = cleanRevision;
      // Clear the copy once storage holds it.
      if (restoredFromCopy) pendingRevision = 0;
      let revision = store.getState().revision;
      unsubscribe = store.subscribe((next) => {
        if (next.revision === revision) return;
        revision = next.revision;
        schedule();
      });
      // Save a change made during the restore, or since the editor last closed.
      if (revision > writtenRevision) schedule();
      document.addEventListener("visibilitychange", onVisibilityChange);
      window.addEventListener("pagehide", flush);
    });

    return () => {
      disposed = true;
      unsubscribe?.();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flush);
      // The editor is closing: keep a change still waiting for its save.
      if (timer !== undefined) flush();
    };
  }, []);
}
