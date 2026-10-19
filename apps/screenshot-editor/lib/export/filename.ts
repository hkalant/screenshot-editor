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

// Characters Windows, macOS or Linux won't take in a file name, and control
// characters.
const FORBIDDEN = /[\\/:*?"<>|\u0000-\u001f\u007f]+/g;

const MAX_STEM = 120;

/**
 * The name offered when saving or exporting, without its extension: the
 * screenshot's own name ("My Dashboard.png" -> "My Dashboard"), or a dated
 * one for pasted or unnamed images ("Screenshot 2026-10-19").
 */
export function suggestedStem(
  sourceName: string | null,
  now = new Date(),
): string {
  const stem = cleanStem((sourceName ?? "").replace(/\.[^./]*$/, ""), []);
  const generic = GENERIC_NAMES.has(stem.toLowerCase().replace(/\s+/g, "-"));
  if (stem && !generic) return stem;
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `Screenshot ${date}`;
}

/**
 * A typed name made safe to save: characters file systems refuse go, as do
 * leading and trailing spaces and dots, and any of `extensions` typed at the
 * end ("Onboarding.screenshot.json" -> "Onboarding"). Empty if nothing is left.
 */
export function cleanStem(
  input: string,
  extensions: readonly string[],
): string {
  let stem = input.replace(FORBIDDEN, " ").replace(/\s+/g, " ").trim();
  for (let changed = true; changed;) {
    changed = false;
    for (const extension of extensions) {
      if (stem.toLowerCase().endsWith(extension.toLowerCase())) {
        stem = stem.slice(0, -extension.length).trimEnd();
        changed = true;
      }
    }
  }
  return stem.slice(0, MAX_STEM).replace(/^[\s.]+|[\s.]+$/g, "");
}

/** Project files end in this, so they read as projects rather than data. */
export const PROJECT_EXTENSION = ".screenshot.json";
