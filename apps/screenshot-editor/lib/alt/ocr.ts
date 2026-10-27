import type { LoadedImage } from "@/lib/image/load";
import { BASE_PATH } from "@/lib/paths";
import type { FoundLine, FoundWord } from "./describe";

// Reads the text in a screenshot, in the browser: the image never leaves
// the machine. The reader (tesseract.js) and its English data are served
// with the site from /ocr (copied there by scripts/copy-ocr.mjs) and only
// downloaded the first time a screenshot is read.

const OCR_PATH = `${BASE_PATH}/ocr`;

/** Words read with less confidence than this (0 to 100) are left out. */
const MIN_CONFIDENCE = 60;
/** Longest wait for the reader to download and start: it's a few MB. */
const START_TIMEOUT_MS = 90_000;
/** Longest wait for one screenshot to be read. */
const READ_TIMEOUT_MS = 60_000;

type Reader = Awaited<ReturnType<typeof import("tesseract.js").createWorker>>;

let reader: Promise<Reader> | null = null;
/** What each screenshot says, by image id: read once. */
const found = new Map<string, Promise<FoundLine[]>>();

/** `promise`, or a rejection after `ms`, so a stalled reader fails instead of reading forever. */
function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(`${what} timed out`)),
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

function getReader() {
  reader ??= (async () => {
    const { createWorker, OEM } = await import("tesseract.js");
    const base = new URL(`${OCR_PATH}/`, window.location.href).href;
    // A part that fails to download (offline, blocked) is reported here, not
    // by createWorker, which would otherwise wait for ever.
    let failStart: (error: Error) => void = () => undefined;
    const failed = new Promise<never>((_, reject) => {
      failStart = reject;
    });
    const starting = createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: `${base}worker.min.js`,
      corePath: base,
      langPath: base,
      gzip: true,
      errorHandler: (error: unknown) => failStart(new Error(String(error))),
    });
    return within(
      Promise.race([starting, failed]),
      START_TIMEOUT_MS,
      "Starting the text reader",
    );
  })();
  // A failed start can be tried again later.
  reader.catch(() => {
    reader = null;
  });
  return reader;
}

/** Stops a reader that stalled, so the next read starts a fresh one. */
function dropReader(stalled: Reader) {
  void stalled.terminate().catch(() => undefined);
  reader = null;
}

/** The screenshot's lines of text, in image widths, or a rejection if it couldn't be read. */
export function readText(image: LoadedImage): Promise<FoundLine[]> {
  let lines = found.get(image.id);
  if (!lines) {
    lines = (async () => {
      const worker = await getReader();
      const { data } = await within(
        worker.recognize(image.source, {}, { blocks: true, text: false }),
        READ_TIMEOUT_MS,
        "Reading the screenshot",
      ).catch((error: unknown) => {
        dropReader(worker);
        throw error;
      });
      const pixels =
        image.source instanceof HTMLImageElement
          ? image.source.naturalWidth
          : image.source.width;
      const toBox = (bbox: {
        x0: number;
        y0: number;
        x1: number;
        y1: number;
      }) => ({
        x: bbox.x0 / pixels,
        y: bbox.y0 / pixels,
        width: (bbox.x1 - bbox.x0) / pixels,
        height: (bbox.y1 - bbox.y0) / pixels,
      });
      return (data.blocks ?? []).flatMap((block) =>
        block.paragraphs.flatMap((paragraph) =>
          paragraph.lines.flatMap((line) => {
            const words: FoundWord[] = line.words
              .filter(
                (word) =>
                  word.confidence >= MIN_CONFIDENCE && word.text.trim() !== "",
              )
              .map((word) => ({
                text: word.text.trim(),
                box: toBox(word.bbox),
              }));
            return words.length ? [{ words, box: toBox(line.bbox) }] : [];
          }),
        ),
      );
    })();
    found.set(image.id, lines);
    lines.catch(() => found.delete(image.id));
  }
  return lines;
}
