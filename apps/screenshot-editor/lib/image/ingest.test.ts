import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/lib/store/editor";
import { IMAGE_MESSAGES } from "./accept";
import { CaptureCancelled, captureScreenFrame } from "./capture";
import { ingestFile, ingestScreenCapture } from "./ingest";
import { fakeImage } from "@/lib/testing/fakeImage";
import { ImageLoadError, loadImageFromBlob, type LoadedImage } from "./load";

vi.mock("./load", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./load")>()),
  loadImageFromBlob: vi.fn(),
}));

vi.mock("./capture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./capture")>()),
  captureScreenFrame: vi.fn(),
}));

const load = vi.mocked(loadImageFromBlob);
const capture = vi.mocked(captureScreenFrame);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const png = (name: string) => new File(["x"], name, { type: "image/png" });
const state = () => useEditorStore.getState();

beforeEach(() => {
  load.mockReset();
  capture.mockReset();
  useEditorStore.setState(useEditorStore.getInitialState(), true);
});

describe("ingestFile", () => {
  it("lets the newest image win when loads finish out of order", async () => {
    const first = deferred<LoadedImage>();
    const second = deferred<LoadedImage>();
    load.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const firstDone = ingestFile(png("a.png"));
    const secondDone = ingestFile(png("b.png"));
    expect(state().loading).toBe(true);

    second.resolve(fakeImage("b"));
    await secondDone;
    expect(state().design.layers[0].imageId).toBe("b");
    expect(state().loading).toBe(false);

    const stale = fakeImage("a");
    first.resolve(stale);
    await firstDone;
    expect(state().design.layers[0].imageId).toBe("b");
    expect(stale.release).toHaveBeenCalledTimes(1);
    expect(state().loading).toBe(false);
  });

  it("ignores a failure from an older load", async () => {
    const first = deferred<LoadedImage>();
    load
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(fakeImage("b"));
    const firstDone = ingestFile(png("a.png"));
    await ingestFile(png("b.png"));
    first.reject(new ImageLoadError("unreadable"));
    await firstDone;
    expect(state().notice).toBeNull();
    expect(state().design.layers[0].imageId).toBe("b");
  });

  it("rejects unsupported files without loading them, and cancels a load in flight", async () => {
    const first = deferred<LoadedImage>();
    load.mockReturnValueOnce(first.promise);
    const firstDone = ingestFile(png("a.png"));
    await ingestFile(new File(["x"], "anim.gif", { type: "image/gif" }));
    expect(load).toHaveBeenCalledTimes(1);
    expect(state().notice?.message).toBe(IMAGE_MESSAGES.unsupported);
    expect(state().loading).toBe(false);

    const stale = fakeImage("a");
    first.resolve(stale);
    await firstDone;
    expect(state().design.layers[0].imageId).toBeNull();
    expect(stale.release).toHaveBeenCalledTimes(1);
  });

  it("keeps screenshot and background loads apart", async () => {
    const shot = deferred<LoadedImage>();
    load
      .mockReturnValueOnce(shot.promise)
      .mockResolvedValueOnce(fakeImage("bg"));
    const shotDone = ingestFile(png("a.png"));
    // A background upload must not cancel the screenshot still loading.
    await ingestFile(png("bg.png"), "background");
    shot.resolve(fakeImage("a"));
    await shotDone;
    expect(state().design.layers[0].imageId).toBe("a");
    expect(state().design.background).toEqual({
      kind: "image",
      source: { type: "upload", imageId: "bg" },
    });
  });

  it("stays loading until both a screenshot and a background have loaded", async () => {
    const shot = deferred<LoadedImage>();
    load
      .mockReturnValueOnce(shot.promise)
      .mockResolvedValueOnce(fakeImage("bg"));
    const shotDone = ingestFile(png("a.png"));
    await ingestFile(png("bg.png"), "background");
    expect(state().loading).toBe(true);
    shot.resolve(fakeImage("a"));
    await shotDone;
    expect(state().loading).toBe(false);
  });

  it("explains why an image could not be loaded", async () => {
    load.mockRejectedValueOnce(new ImageLoadError("tooManyPixels"));
    await ingestFile(png("huge.png"));
    expect(state().notice?.message).toBe(IMAGE_MESSAGES.tooManyPixels);

    load.mockRejectedValueOnce(new ImageLoadError("unreadable"));
    await ingestFile(png("broken.png"));
    expect(state().notice?.message).toBe(IMAGE_MESSAGES.unreadable);
    expect(state().loading).toBe(false);
  });
});

describe("ingestScreenCapture", () => {
  it("is loading from the moment something is picked", async () => {
    const frame = deferred<File>();
    let picked!: () => void;
    capture.mockImplementation((onPicked) => {
      picked = onPicked!;
      return frame.promise;
    });
    load.mockResolvedValueOnce(fakeImage("captured"));

    const done = ingestScreenCapture();
    // The picker is open: capturing, not loading yet.
    expect(state().capturing).toBe(true);
    expect(state().loading).toBe(false);
    picked();
    expect(state().loading).toBe(true);

    frame.resolve(png("image.png"));
    await done;
    expect(state().design.layers[0].imageId).toBe("captured");
    expect(state().capturing).toBe(false);
    expect(state().loading).toBe(false);
  });

  it("stops loading when the frame can't be taken, and says so", async () => {
    capture.mockImplementation(async (onPicked) => {
      onPicked?.();
      throw new Error("No frame");
    });
    await ingestScreenCapture();
    expect(state().loading).toBe(false);
    expect(state().capturing).toBe(false);
    expect(state().notice?.message).toBe(IMAGE_MESSAGES.captureFailed);
  });

  it("shows nothing when the picker is closed", async () => {
    capture.mockRejectedValueOnce(new CaptureCancelled());
    await ingestScreenCapture();
    expect(state().loading).toBe(false);
    expect(state().notice).toBeNull();
  });
});
