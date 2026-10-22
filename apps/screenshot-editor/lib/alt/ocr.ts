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

type Reader = Awaited<ReturnType<typeof import("tesseract.js").createWorker>>;

let reader: Promise<Reader> | null = null;
/** What each screenshot says, by image id: read once. */
const found = new Map<string, Promise<FoundLine[]>>();

function getReader() {
  reader ??= (async () => {
    const { createWorker, OEM } = await import("tesseract.js");
    const base = new URL(`${OCR_PATH}/`, window.location.href).href;
    return createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: `${base}worker.min.js`,
      corePath: base,
      langPath: base,
      gzip: true,
    });
  })();
  // A failed start (offline, blocked) can be tried again later.
  reader.catch(() => {
    reader = null;
  });
  return reader;
}

/** The screenshot's lines of text, in image widths, or a rejection if it couldn't be read. */
export function readText(image: LoadedImage): Promise<FoundLine[]> {
  let lines = found.get(image.id);
  if (!lines) {
    lines = (async () => {
      const worker = await getReader();
      const { data } = await worker.recognize(
        image.source,
        {},
        { blocks: true, text: false },
      );
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
