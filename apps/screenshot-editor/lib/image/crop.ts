import { croppedSize } from "@/lib/design/crop";
import type { Crop } from "@/lib/design/schema";
import type { LoadedImage } from "./load";

// The cropped copy of each image, made once per crop. It keeps the
// original's file, so saving and "Download original" still use the original.
const copies = new WeakMap<LoadedImage, { key: string; image: LoadedImage }>();

const keyOf = (crop: Crop) =>
  `${crop.x},${crop.y},${crop.width},${crop.height}`;

/** `image` cropped to `crop`: the same object for the same crop. */
export function croppedImage(image: LoadedImage, crop: Crop): LoadedImage {
  const key = keyOf(crop);
  const held = copies.get(image);
  if (held?.key === key) return held.image;

  const size = croppedSize(image, crop);
  const id = `${image.id}#${key}`;
  // Without a DOM (unit tests) there's nothing to draw on, only sizes.
  if (typeof document === "undefined") {
    const copy = { ...image, id, ...size };
    copies.set(image, { key, image: copy });
    return copy;
  }

  const source = image.source;
  const pixels =
    source instanceof HTMLImageElement
      ? { width: source.naturalWidth, height: source.naturalHeight }
      : { width: source.width, height: source.height };
  // The source can be smaller than the original after downscaling on load.
  const drawn = croppedSize(pixels, crop);
  const canvas = document.createElement("canvas");
  canvas.width = drawn.width;
  canvas.height = drawn.height;
  canvas
    .getContext("2d")
    ?.drawImage(
      source,
      crop.x * pixels.width,
      crop.y * pixels.height,
      crop.width * pixels.width,
      crop.height * pixels.height,
      0,
      0,
      drawn.width,
      drawn.height,
    );
  const copy: LoadedImage = {
    // Its own id, so its text is read again (see ocr.ts).
    id,
    name: image.name,
    blob: image.blob,
    source: canvas,
    width: size.width,
    height: size.height,
    release: () => {
      canvas.width = 0;
      canvas.height = 0;
    },
  };
  held?.image.release();
  copies.set(image, { key, image: copy });
  return copy;
}

/** The id of the image a cropped copy was made from (or `id` itself). */
export const originalImageId = (id: string) => id.split("#")[0];
