import { MAX_FILE_BYTES } from "@/lib/design/limits";
import { migrateDesign } from "@/lib/design/migrate";
import { referencedImageIds } from "@/lib/design/refs";
import type { Design } from "@/lib/design/schema";
import type { LoadedImage } from "@/lib/image/load";

// A project file: the design, with every annotation still editable, and the
// images it draws, so it reopens anywhere. JSON, with each image's original
// file as base64.

export const PROJECT_FORMAT = "screenshot-editor-project";
/** Bumped when the file's own layout changes; the design inside has its own versions. */
export const PROJECT_VERSION = 1;

/** Two images of up to MAX_FILE_BYTES each, as base64, plus the design. */
export const MAX_PROJECT_BYTES = Math.ceil(MAX_FILE_BYTES * 2 * (4 / 3)) + 1e6;

type ProjectImage = { name: string; type: string; data: string };

export type ProjectFile = {
  format: typeof PROJECT_FORMAT;
  version: number;
  savedAt: string;
  design: Design;
  images: Record<string, ProjectImage>;
};

export const PROJECT_MESSAGES = {
  unreadable: "This project file can't be opened.",
  newer: "This project was saved by a newer version of the editor.",
  tooLarge: "That project file is too large.",
  images: "This project's images can't be read.",
} as const;

export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectError";
  }
}

function toBase64(bytes: Uint8Array): string {
  // In chunks: String.fromCharCode can't take millions of arguments.
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(data: string): Uint8Array<ArrayBuffer> {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The project as JSON text: the design and the original file of every image it uses. */
export async function serializeProject(
  design: Design,
  images: Record<string, LoadedImage>,
  now = new Date(),
): Promise<string> {
  const entries: Record<string, ProjectImage> = {};
  for (const id of referencedImageIds(design)) {
    const image = images[id];
    if (!image) continue;
    const bytes = new Uint8Array(await image.blob.arrayBuffer());
    entries[id] = {
      name: image.name,
      type: image.blob.type,
      data: toBase64(bytes),
    };
  }
  const file: ProjectFile = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: now.toISOString(),
    design,
    images: entries,
  };
  return JSON.stringify(file);
}

/** Whether a file looks like a project (by name or type) rather than an image. */
export function isProjectFile(file: { name: string; type: string }): boolean {
  return (
    file.type === "application/json" ||
    file.name.toLowerCase().endsWith(".json")
  );
}

// Only these formats, by their own type or, untyped, by extension. The blob
// gets the canonical type, so a file that says "PNG" can't be read as, say, SVG.
const IMAGE_TYPES: Record<string, string> = {
  "image/png": "image/png",
  "image/x-png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/webp": "image/webp",
};
const EXTENSION_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

function imageType(name: string, type: string): string | null {
  if (type) return IMAGE_TYPES[type.toLowerCase()] ?? null;
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
  return EXTENSION_TYPES[extension] ?? null;
}

type LoadImage = (blob: Blob, name: string) => Promise<LoadedImage>;

/** The design with its image ids replaced, so they can't clash with images already open. */
function withImageIds(design: Design, ids: Map<string, string>): Design {
  const swap = (id: string) => ids.get(id) ?? id;
  const [shot] = design.layers;
  let next: Design = {
    ...design,
    layers: [{ ...shot, imageId: shot.imageId ? swap(shot.imageId) : null }],
    annotations: design.annotations.map((annotation) =>
      annotation.kind === "screenshot"
        ? { ...annotation, imageId: swap(annotation.imageId) }
        : annotation,
    ),
  };
  const { background } = next;
  if (background.kind === "image" && background.source.type === "upload")
    next = {
      ...next,
      background: {
        ...background,
        source: {
          ...background.source,
          imageId: swap(background.source.imageId),
        },
      },
    };
  return next;
}

/**
 * Reads a project file's text into a design and its decoded images. The file
 * may come from anywhere, so everything is checked: the layout, the design
 * (migrated from older versions), and each image as strictly as an upload.
 * Throws a ProjectError with a message for the user.
 */
export async function parseProject(
  text: string,
  loadImage: LoadImage,
): Promise<{ design: Design; images: LoadedImage[] }> {
  if (text.length > MAX_PROJECT_BYTES)
    throw new ProjectError(PROJECT_MESSAGES.tooLarge);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectError(PROJECT_MESSAGES.unreadable);
  }
  const file = raw as Partial<Record<keyof ProjectFile, unknown>> | null;
  if (!file || typeof file !== "object" || file.format !== PROJECT_FORMAT)
    throw new ProjectError(PROJECT_MESSAGES.unreadable);
  if (typeof file.version !== "number" || !Number.isInteger(file.version))
    throw new ProjectError(PROJECT_MESSAGES.unreadable);
  if (file.version > PROJECT_VERSION)
    throw new ProjectError(PROJECT_MESSAGES.newer);
  const design = migrateDesign(file.design);
  if (!design) throw new ProjectError(PROJECT_MESSAGES.unreadable);
  const entries =
    file.images && typeof file.images === "object"
      ? (file.images as Record<string, unknown>)
      : {};

  const images: LoadedImage[] = [];
  const ids = new Map<string, string>();
  try {
    for (const id of referencedImageIds(design)) {
      if (ids.has(id)) continue;
      const entry = Object.hasOwn(entries, id)
        ? (entries[id] as Partial<ProjectImage> | null)
        : null;
      if (
        !entry ||
        typeof entry.name !== "string" ||
        typeof entry.type !== "string" ||
        typeof entry.data !== "string"
      )
        throw new ProjectError(PROJECT_MESSAGES.images);
      const type = imageType(entry.name, entry.type);
      if (!type) throw new ProjectError(PROJECT_MESSAGES.images);
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        bytes = fromBase64(entry.data);
      } catch {
        throw new ProjectError(PROJECT_MESSAGES.images);
      }
      if (bytes.length === 0 || bytes.length > MAX_FILE_BYTES)
        throw new ProjectError(PROJECT_MESSAGES.images);
      const blob = new Blob([bytes], { type });
      let image: LoadedImage;
      try {
        image = await loadImage(blob, entry.name.slice(0, 255));
      } catch {
        throw new ProjectError(PROJECT_MESSAGES.images);
      }
      images.push(image);
      ids.set(id, image.id);
    }
  } catch (error) {
    for (const image of images) image.release();
    throw error;
  }
  return { design: withImageIds(design, ids), images };
}
