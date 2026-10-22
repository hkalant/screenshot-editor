// Copies the in-browser text reader (tesseract.js) and its English data into
// public/ocr, so the site serves them itself: no CDN, and screenshots are
// read on the user's machine. Run before every dev server and build.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const out = join(import.meta.dirname, "..", "public", "ocr");
mkdirSync(out, { recursive: true });

const from = (pkg, file) =>
  join(dirname(require.resolve(`${pkg}/package.json`)), file);
const files = [
  [from("tesseract.js", "dist/worker.min.js"), "worker.min.js"],
  // The LSTM-only cores; the reader picks the fastest the browser supports.
  ...[
    "tesseract-core-lstm",
    "tesseract-core-simd-lstm",
    "tesseract-core-relaxedsimd-lstm",
  ].map((core) => [
    from("tesseract.js-core", `${core}.wasm.js`),
    `${core}.wasm.js`,
  ]),
  // Compact, accurate English data.
  [
    from("@tesseract.js-data/eng", "4.0.0_best_int/eng.traineddata.gz"),
    "eng.traineddata.gz",
  ],
];
for (const [source, name] of files) copyFileSync(source, join(out, name));
console.log(`Copied the text reader to ${out}`);
