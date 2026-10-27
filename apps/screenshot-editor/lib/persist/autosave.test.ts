import { describe, expect, it, vi } from "vitest";
import { createDefaultDesign, defaultBackground } from "@/lib/design/defaults";
import type { Design } from "@/lib/design/schema";
import type { LoadedImage } from "@/lib/image/load";
import { fakeImage } from "@/lib/testing/fakeImage";
import {
  DESIGN_KEY,
  imageKey,
  newerSavedDesign,
  restoreSnapshot,
  saveSnapshot,
  saveSnapshotNow,
  type AutosaveStorage,
} from "./autosave";

function memoryStorage(failWrites = false) {
  const map = new Map<string, unknown>();
  const storage: AutosaveStorage = {
    read: async <T>(key: string) => map.get(key) as T | undefined,
    write: vi.fn(async (key: string, value: unknown) => {
      if (failWrites) return false;
      map.set(key, value);
      return true;
    }),
    remove: async (key: string) => map.delete(key),
    keys: async () => [...map.keys()],
    writeNow: vi.fn((entries: [string, unknown][]) => {
      for (const [key, value] of entries) map.set(key, value);
      return true;
    }),
  };
  return { map, storage };
}

function designWith(shotId: string | null, backgroundId?: string): Design {
  const design = createDefaultDesign();
  return {
    ...design,
    background: backgroundId
      ? { kind: "image", source: { type: "upload", imageId: backgroundId } }
      : design.background,
    layers: [{ ...design.layers[0], imageId: shotId }],
  };
}

const loadImage = async (blob: Blob, name: string, { id }: { id: string }) => ({
  ...fakeImage(id),
  name,
  blob,
});

describe("saveSnapshot", () => {
  it("keeps the alt text the user wrote through a restore", async () => {
    const { storage } = memoryStorage();
    const altText = { text: "The course menu.", basis: "0badf00d" };
    await saveSnapshot(
      storage,
      { ...designWith("a"), altText },
      {
        a: fakeImage("a"),
      },
    );
    const restored = await restoreSnapshot(storage, loadImage);
    expect(restored?.design.altText).toEqual(altText);
  });

  it("writes the images once, then the design, and deletes unused images", async () => {
    const { map, storage } = memoryStorage();
    const images: Record<string, LoadedImage> = {
      a: fakeImage("a"),
      bg: fakeImage("bg"),
      b: fakeImage("b"),
    };

    expect(await saveSnapshot(storage, designWith("a", "bg"), images)).toBe(
      true,
    );
    expect([...map.keys()].sort()).toEqual([
      DESIGN_KEY,
      imageKey("a"),
      imageKey("bg"),
    ]);

    await saveSnapshot(storage, designWith("a", "bg"), images);
    // Two images and two designs: images are not rewritten.
    expect(storage.write).toHaveBeenCalledTimes(4);

    await saveSnapshot(storage, designWith("b"), images);
    expect([...map.keys()].sort()).toEqual([DESIGN_KEY, imageKey("b")]);
  });

  it("rewrites an image another tab deleted", async () => {
    const { map, storage } = memoryStorage();
    const images = { a: fakeImage("a"), b: fakeImage("b") };
    // Tab 1 saves A, tab 2 saves B (deleting A), then tab 1 saves again.
    await saveSnapshot(storage, designWith("a"), images);
    await saveSnapshot(storage, designWith("b"), images);
    await saveSnapshot(storage, designWith("a"), images);
    expect([...map.keys()].sort()).toEqual([DESIGN_KEY, imageKey("a")]);
  });

  it("stores image bytes rather than a Blob, which WebKit private browsing refuses", async () => {
    const { map, storage } = memoryStorage();
    await saveSnapshot(storage, designWith("a"), { a: fakeImage("a") });
    const record = map.get(imageKey("a")) as Record<string, unknown>;
    expect(record).toMatchObject({ type: "image/png", name: "a.png" });
    expect(record.bytes).toBeInstanceOf(ArrayBuffer);
    expect(record).not.toHaveProperty("blob");
  });

  it("doesn't write an older design over a newer one, or delete its images", async () => {
    const { map, storage } = memoryStorage();
    const images = { a: fakeImage("a"), b: fakeImage("b") };
    // The page closed while this save waited: the newer design uses B.
    saveSnapshotNow(storage, designWith("b"), images);
    expect(
      await saveSnapshot(storage, designWith("a"), images, () => false),
    ).toBe(true);
    expect(map.get(DESIGN_KEY)).toMatchObject({ design: designWith("b") });
    expect(map.has(imageKey("b"))).toBe(true);
  });

  it("reports failing storage", async () => {
    const { storage } = memoryStorage(true);
    expect(
      await saveSnapshot(storage, designWith("a"), { a: fakeImage("a") }),
    ).toBe(false);
  });
});

describe("saveSnapshotNow", () => {
  it("writes the design with every image it uses, in one go", () => {
    const { map, storage } = memoryStorage();
    const images = { a: fakeImage("a"), bg: fakeImage("bg") };
    expect(saveSnapshotNow(storage, designWith("a", "bg"), images)).toBe(true);
    expect(storage.writeNow).toHaveBeenCalledTimes(1);
    expect([...map.keys()].sort()).toEqual([
      DESIGN_KEY,
      imageKey("a"),
      imageKey("bg"),
    ]);
    expect(map.get(DESIGN_KEY)).toMatchObject({
      design: designWith("a", "bg"),
    });
  });

  it("stores bytes for images an earlier save already read", async () => {
    const { map, storage } = memoryStorage();
    const images = { a: fakeImage("a"), b: fakeImage("b") };
    await saveSnapshot(storage, designWith("a"), images);
    saveSnapshotNow(storage, designWith("a", "b"), images);
    expect(map.get(imageKey("a"))).toHaveProperty("bytes");
    // Not read yet, and an unload can't wait: the Blob itself.
    expect(map.get(imageKey("b"))).toHaveProperty("blob");
  });

  it("can't save without an immediate write", () => {
    const { storage } = memoryStorage();
    delete storage.writeNow;
    expect(saveSnapshotNow(storage, designWith(null), {})).toBe(false);
  });
});

describe("restoreSnapshot", () => {
  it("frees decoded images when storage stops answering part-way", async () => {
    const { map, storage } = memoryStorage();
    map.set(DESIGN_KEY, { design: designWith("a", "bg"), savedAt: 1 });
    map.set(imageKey("a"), { blob: new Blob(["a"]), name: "a.png" });
    const decoded: LoadedImage[] = [];
    const failingRead: AutosaveStorage = {
      ...storage,
      read: async <T>(key: string) => {
        if (key === imageKey("bg")) throw new Error("timed out");
        return storage.read<T>(key);
      },
    };
    await expect(
      restoreSnapshot(failingRead, async (blob, name, options) => {
        const image = { ...fakeImage(options.id), release: vi.fn() };
        decoded.push(image);
        return image;
      }),
    ).rejects.toThrow("timed out");
    expect(decoded).toHaveLength(1);
    expect(decoded[0].release).toHaveBeenCalled();
  });

  it("restores the design and decodes its images with their ids", async () => {
    const { storage } = memoryStorage();
    const design = designWith("a", "bg");
    await saveSnapshot(storage, design, {
      a: fakeImage("a"),
      bg: fakeImage("bg"),
    });
    const restored = await restoreSnapshot(storage, loadImage);
    expect(restored?.design).toEqual(design);
    expect(restored?.images.map((image) => image.id)).toEqual(["a", "bg"]);
  });

  it("restores images saved as a Blob by earlier versions", async () => {
    const { map, storage } = memoryStorage();
    map.set(DESIGN_KEY, { design: designWith("a"), savedAt: 1 });
    map.set(imageKey("a"), { blob: new Blob(["a"]), name: "a.png" });
    const restored = await restoreSnapshot(storage, loadImage);
    expect(restored?.images.map((image) => image.id)).toEqual(["a"]);
  });

  it("restores the bytes as a Blob of the saved type", async () => {
    const { storage } = memoryStorage();
    await saveSnapshot(storage, designWith("a"), { a: fakeImage("a") });
    const restored = await restoreSnapshot(storage, loadImage);
    const [image] = restored?.images ?? [];
    expect(image.blob.type).toBe("image/png");
    expect(await image.blob.text()).toBe("a");
  });

  it("drops images that are missing or can't be decoded", async () => {
    const { map, storage } = memoryStorage();
    await saveSnapshot(storage, designWith("a", "bg"), {
      a: fakeImage("a"),
      bg: fakeImage("bg"),
    });
    map.delete(imageKey("bg"));
    const failing = async () => {
      throw new Error("decode failed");
    };
    const restored = await restoreSnapshot(storage, failing);
    expect(restored?.images).toEqual([]);
    expect(restored?.design.layers[0].imageId).toBeNull();
    expect(restored?.design.background).toEqual(defaultBackground());
  });

  it("returns null for nothing saved or an invalid design", async () => {
    const { map, storage } = memoryStorage();
    expect(await restoreSnapshot(storage, loadImage)).toBeNull();
    map.set(DESIGN_KEY, { design: { version: 99 }, savedAt: 1 });
    expect(await restoreSnapshot(storage, loadImage)).toBeNull();
  });
});

describe("newerSavedDesign", () => {
  const saved = (savedAt: number, padding = 64) => {
    const design = createDefaultDesign();
    return {
      design: { ...design, layers: [{ ...design.layers[0], padding }] },
      savedAt,
    };
  };

  it("picks the newer of storage and the copy kept on close", () => {
    expect(newerSavedDesign(saved(1), saved(2, 80))).toEqual(saved(2, 80));
    expect(newerSavedDesign(saved(3), saved(2, 80))).toEqual(saved(3));
    // A tie goes to the copy, written after the storage save.
    expect(newerSavedDesign(saved(2), saved(2, 80))).toEqual(saved(2, 80));
  });

  it("ignores a missing or invalid save on either side", () => {
    expect(newerSavedDesign(undefined, saved(1))).toEqual(saved(1));
    expect(newerSavedDesign(saved(1), null)).toEqual(saved(1));
    expect(
      newerSavedDesign(saved(1), { design: { version: 99 }, savedAt: 5 }),
    ).toEqual(saved(1));
    expect(newerSavedDesign(null, "junk")).toBeUndefined();
  });
});
