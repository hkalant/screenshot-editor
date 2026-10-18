import { create } from "zustand";
import sample from "@/assets/samples/sample-screenshot.jpg";
import { referencedImageIds } from "@/lib/design/refs";
import { ingestSample } from "@/lib/image/ingest";
import { readPreference, writePreference } from "@/lib/persist/preferences";
import { useEditorStore, type EditorState } from "@/lib/store/editor";

// The welcome tour: a modal, then steps that point at the main features. It
// shows a sample screenshot while it runs and puts back whatever was there
// before when it ends, however it ends.

const SEEN_KEY = "tour-seen";

/** Whether this browser has started or skipped the tour before. */
export const tourSeen = () => readPreference(SEEN_KEY) !== null;

type Snapshot = Pick<
  EditorState,
  "design" | "past" | "future" | "activePanel" | "selectedAnnotationId"
>;

type TourState = {
  /** 0 is the welcome modal; null when the tour isn't showing. */
  step: number | null;
  /** True while the sample loads after Start. */
  starting: boolean;
  open: () => void;
  start: () => Promise<void>;
  go: (step: number) => void;
  end: () => void;
};

let snapshot: Snapshot | null = null;

/**
 * The user's design while the tour shows the sample in its place, else null.
 * Autosave saves this instead, so closing the page mid-tour reopens on their
 * own design rather than the sample.
 */
export const designUnderTour = () => snapshot?.design ?? null;

/** Puts back the design, history and panel saved at Start, and frees the sample. */
function restore() {
  if (!snapshot) return;
  const saved = snapshot;
  snapshot = null;
  useEditorStore.setState((state) => ({
    ...saved,
    // Adding the sample may have freed images only old history used.
    past: saved.past.filter((design) =>
      referencedImageIds(design).every((id) => id in state.images),
    ),
    revision: state.revision + 1,
    mergeKey: null,
    gesture: false,
    annotationTool: "select",
  }));
  useEditorStore.getState().pruneImages();
}

export const useTourStore = create<TourState>()((set, get) => ({
  step: null,
  starting: false,

  open: () => {
    if (get().step === null) set({ step: 0 });
  },

  start: async () => {
    if (get().starting) return;
    writePreference(SEEN_KEY, "1");
    const editor = useEditorStore.getState();
    snapshot = {
      design: editor.design,
      past: editor.past,
      future: editor.future,
      activePanel: editor.activePanel,
      selectedAnnotationId: editor.selectedAnnotationId,
    };
    set({ starting: true });
    await ingestSample(sample.src);
    // Ended (Esc) while the sample loaded: undo it now it's in.
    if (get().step === null) return restore();
    useEditorStore.getState().setActivePanel("background");
    set({ starting: false, step: 1 });
  },

  go: (step) => set({ step }),

  end: () => {
    writePreference(SEEN_KEY, "1");
    const { starting } = get();
    set({ step: null, starting: false });
    // A sample still loading is put away by start once it's in.
    if (!starting) restore();
  },
}));
