import { create } from "zustand";
import { downloadBlob } from "./exportImage";
import { cleanStem } from "./filename";

// Saving a file under a name the user chooses. Where the browser offers the
// system's Save dialog (Chrome and Edge), that is used, so the folder can be
// chosen too; elsewhere the editor asks for the name and the file downloads.

export type SaveRequest = {
  /** The dialog's title and button, such as "Save project" and "Save". */
  title: string;
  action: string;
  /** A line under the title, such as "PNG at 2×, 3840 × 2160." */
  description: string;
  /** The name offered, without the extension. */
  stem: string;
  /** Added to the name, with its dot: ".png", ".screenshot.json". */
  extension: string;
  mime: string;
  /** What the system dialog calls the file type, such as "PNG image". */
  typeLabel: string;
  /** The type's ending for the system dialog, if not `extension`. */
  pickerExtension?: string;
  /** Endings removed if typed, besides `extension`, such as ".jpeg". */
  alsoStrip?: readonly string[];
};

export type SaveTarget = {
  /** The chosen name, without the extension. */
  stem: string;
  write: (blob: Blob) => Promise<void>;
};

type SaveFilePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{
  name: string;
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

const savePicker = (): SaveFilePicker | undefined =>
  (window as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;

/** What the name dialog shows, and how it answers. */
export const useSaveDialogStore = create<{
  request: SaveRequest | null;
  answer: ((stem: string | null) => void) | null;
  /** Where focus was before the dialog, to go back to after it. */
  returnFocus: HTMLElement | null;
}>()(() => ({ request: null, answer: null, returnFocus: null }));

/** Shows the editor's name dialog. The cleaned name, or null if cancelled. */
export function askFileName(request: SaveRequest): Promise<string | null> {
  useSaveDialogStore.getState().answer?.(null);
  return new Promise((resolve) => {
    const active = document.activeElement;
    useSaveDialogStore.setState({
      request,
      returnFocus: active instanceof HTMLElement ? active : null,
      answer: (stem) => {
        useSaveDialogStore.setState({ request: null, answer: null });
        resolve(stem);
      },
    });
  });
}

const stripped = (request: SaveRequest) => [
  request.extension,
  ...(request.alsoStrip ?? []),
];

/**
 * Asks where to save and under what name. Call it straight from the click or
 * key press: the system dialog only opens during one. Null if cancelled.
 */
export async function chooseSaveTarget(
  request: SaveRequest,
): Promise<SaveTarget | null> {
  const picker = savePicker();
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: `${request.stem}${request.extension}`,
        types: [
          {
            description: request.typeLabel,
            accept: {
              [request.mime]: [request.pickerExtension ?? request.extension],
            },
          },
        ],
      });
      return {
        stem: cleanStem(handle.name, stripped(request)) || request.stem,
        write: async (blob) => {
          const file = await handle.createWritable();
          await file.write(blob);
          await file.close();
        },
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        return null;
      // Not allowed here (such as in an embedded preview): ask instead.
    }
  }
  const typed = await askFileName(request);
  if (typed === null) return null;
  const stem = cleanStem(typed, stripped(request)) || request.stem;
  return {
    stem,
    write: async (blob) => downloadBlob(blob, `${stem}${request.extension}`),
  };
}

// The name last chosen for each screenshot, offered again next time.
const chosenStems = new Map<string, string>();

export const rememberedStem = (imageId: string) => chosenStems.get(imageId);

export function rememberStem(imageId: string, stem: string) {
  chosenStems.set(imageId, stem);
}
