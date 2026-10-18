// Names browsers and apps give to pasted or unnamed images.
const GENERIC_NAMES = new Set([
  "image",
  "blob",
  "clipboard",
  "pasted-image",
  "untitled",
]);

const pad = (value: number) => String(value).padStart(2, "0");

function timestamp(now: Date): string {
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${date}-${time}`;
}

/** A file-name-safe stem from the source name, or a timestamped one for pasted or unnamed images. */
function baseName(sourceName: string | null, now: Date): string {
  const stem = (sourceName ?? "").replace(/\.[^./]*$/, "");
  const cleaned = stem
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // drop accents left over by NFKD
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return cleaned && !GENERIC_NAMES.has(cleaned)
    ? cleaned
    : `screenshot-${timestamp(now)}`;
}

/** "My Dashboard.png" at 2x -> "my-dashboard-2x.png"; a pasted "image.png" -> "screenshot-YYYYMMDD-HHmmss-2x.png". */
export function exportFilename(
  sourceName: string | null,
  scale: number,
  now = new Date(),
  extension = "png",
): string {
  return `${baseName(sourceName, now)}-${scale}x.${extension}`;
}

const TYPE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/x-png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/pjpeg": "jpg",
  "image/webp": "webp",
};

/**
 * The name for the untouched original: "My Dashboard.png" ->
 * "my-dashboard-original.png". The extension follows the file's type, then
 * its name, so a pasted image still gets the right one.
 */
export function originalFilename(
  sourceName: string | null,
  type: string,
  now = new Date(),
): string {
  const fromName = /\.([a-z0-9]+)$/i.exec(sourceName ?? "")?.[1]?.toLowerCase();
  const extension =
    TYPE_EXTENSIONS[type.toLowerCase()] ??
    (fromName === "jpeg" ? "jpg" : fromName) ??
    "png";
  return `${baseName(sourceName, now)}-original.${extension}`;
}

/** "My Dashboard.png" -> "my-dashboard.screenshot.json". */
export function projectFilename(
  sourceName: string | null,
  now = new Date(),
): string {
  return `${baseName(sourceName, now)}${PROJECT_EXTENSION}`;
}

/** Project files end in this, so they read as projects rather than data. */
export const PROJECT_EXTENSION = ".screenshot.json";
