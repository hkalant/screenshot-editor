import { MAX_FILE_BYTES } from "@/lib/design/limits";

export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

// Non-standard MIME types some systems and apps report for the same formats.
const ACCEPTED_MIME_TYPES = new Set<string>([
  ...ACCEPTED_IMAGE_TYPES,
  "image/jpg",
  "image/pjpeg",
  "image/x-png",
]);

const ACCEPTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;

/** For <input accept>. Extensions too, because Windows can map .webp to no MIME type. */
export const ACCEPT_ATTR = [
  ...ACCEPTED_IMAGE_TYPES,
  ...ACCEPTED_EXTENSIONS,
].join(",");

export const IMAGE_MESSAGES = {
  unsupported: "Unsupported file type. Use PNG, JPG or WebP.",
  tooLarge: "That file is too large (max 50 MB).",
  tooManyPixels: "That image is too large (max 50 megapixels).",
  unreadable: "Couldn't read that image.",
  dropHint: "Drop a PNG, JPG or WebP file.",
  sampleFailed: "Couldn't load the sample image.",
  captureFailed: "Couldn't take a screenshot.",
} as const;

type FileLike = { name: string; type: string; size?: number };

export function isAcceptedImageFile(file: FileLike): boolean {
  if (ACCEPTED_MIME_TYPES.has(file.type.toLowerCase())) return true;
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension));
}

export type FileCheck = { ok: true } | { ok: false; message: string };

export function validateImageFile(file: FileLike): FileCheck {
  if (!isAcceptedImageFile(file))
    return { ok: false, message: IMAGE_MESSAGES.unsupported };
  if ((file.size ?? 0) > MAX_FILE_BYTES)
    return { ok: false, message: IMAGE_MESSAGES.tooLarge };
  return { ok: true };
}

/** The first file we can use, or null. */
export function pickImageFile<T extends FileLike>(
  files: Iterable<T>,
): T | null {
  for (const file of files) {
    if (isAcceptedImageFile(file)) return file;
  }
  return null;
}
