import { describe, expect, it, vi } from "vitest";
import { createDefaultDesign } from "@/lib/design/defaults";
import type { Design } from "@/lib/design/schema";
import type { LoadedImage } from "@/lib/image/load";
import { fakeImage } from "@/lib/testing/fakeImage";
import {
  parseProject,
  PROJECT_FORMAT,
  PROJECT_MESSAGES,
  PROJECT_VERSION,
  serializeProject,
} from "./project";

function designWith(imageId: string | null): Design {
  const design = createDefaultDesign();
  return {
    ...design,
    layers: [{ ...design.layers[0], imageId }],
    annotations: [
      {
        id: "a1",
        kind: "arrow",
        x: 0.1,
        y: 0.1,
        dx: 0.3,
        dy: 0.2,
        color: "#d10373",
        style: "bold",
        bend: 0.1,
      },
    ],
  };
}

/** A loader that keeps the bytes it was given, under a fresh id. */
function loader() {
  let next = 0;
  const loaded: { blob: Blob; name: string }[] = [];
  const load = vi.fn(async (blob: Blob, name: string): Promise<LoadedImage> => {
    next += 1;
    loaded.push({ blob, name });
    return { ...fakeImage(`new-${next}`), blob, name };
  });
  return { load, loaded };
}

const fileWith = (patch: Record<string, unknown>) =>
  JSON.stringify({
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: "2026-10-17T00:00:00.000Z",
    design: designWith(null),
    images: {},
    ...patch,
  });

describe("project files", () => {
  it("round-trips the design and the original image bytes", async () => {
    const shot = {
      ...fakeImage("shot"),
      name: "Dashboard.png",
      blob: new Blob([new Uint8Array([137, 80, 78, 71, 0, 255])], {
        type: "image/png",
      }),
    };
    const text = await serializeProject(designWith("shot"), { shot });
    const { load, loaded } = loader();
    const { design, images } = await parseProject(text, load);

    expect(images.map((image) => image.id)).toEqual(["new-1"]);
    // The image gets a fresh id, and the design points at it.
    expect(design.layers[0].imageId).toBe("new-1");
    expect(design.annotations).toEqual(designWith("shot").annotations);
    expect(loaded[0].name).toBe("Dashboard.png");
    expect(loaded[0].blob.type).toBe("image/png");
    expect([...new Uint8Array(await loaded[0].blob.arrayBuffer())]).toEqual([
      137, 80, 78, 71, 0, 255,
    ]);
  });

  it("keeps the alt text the user wrote", async () => {
    const altText = { text: "The course menu.", basis: "0badf00d" };
    const text = await serializeProject(
      { ...designWith("shot"), altText },
      { shot: fakeImage("shot") },
    );
    const { design } = await parseProject(text, loader().load);
    expect(design.altText).toEqual(altText);
  });

  it("opens a project saved before alt text was kept", async () => {
    const old: Partial<Design> = designWith(null);
    delete old.altText;
    const { design } = await parseProject(
      fileWith({ design: old }),
      loader().load,
    );
    expect(design.altText).toBeNull();
  });

  it("keeps the second screenshot's image", async () => {
    const image = (id: string, byte: number) => ({
      ...fakeImage(id),
      name: `${id}.png`,
      blob: new Blob([new Uint8Array([byte])], { type: "image/png" }),
    });
    const base = designWith("shot");
    const design: Design = {
      ...base,
      annotations: [
        ...base.annotations,
        {
          id: "s1",
          kind: "screenshot",
          imageId: "second",
          x: 0.5,
          y: 0.5,
          width: 0.3,
          height: 0.2,
          crop: null,
          frame: "none",
          title: "",
          url: "",
        },
      ],
    };
    const text = await serializeProject(design, {
      shot: image("shot", 1),
      second: image("second", 2),
    });
    const { load, loaded } = loader();
    const { design: opened, images } = await parseProject(text, load);

    expect(images.map((item) => item.id)).toEqual(["new-1", "new-2"]);
    expect(loaded.map((item) => item.name)).toEqual(["shot.png", "second.png"]);
    const second = opened.annotations.find(
      (annotation) => annotation.kind === "screenshot",
    );
    expect(second?.kind === "screenshot" && second.imageId).toBe("new-2");
  });

  it("opens a project with no screenshot", async () => {
    const { load } = loader();
    const { design, images } = await parseProject(fileWith({}), load);
    expect(design.layers[0].imageId).toBeNull();
    expect(images).toEqual([]);
  });

  it("migrates older designs inside the file", async () => {
    const old = designWith(null);
    const text = fileWith({
      design: {
        ...old,
        annotations: [{ ...old.annotations[0], style: "refined" }],
      },
    });
    const { design } = await parseProject(text, loader().load);
    const [arrow] = design.annotations;
    expect(arrow.kind === "arrow" && arrow.style).toBe("solid");
  });

  it.each([
    ["not JSON", "{oops", PROJECT_MESSAGES.unreadable],
    [
      "another kind of JSON",
      JSON.stringify({ hello: 1 }),
      PROJECT_MESSAGES.unreadable,
    ],
    [
      "a broken design",
      fileWith({ design: { version: 2 } }),
      PROJECT_MESSAGES.unreadable,
    ],
    [
      "a newer file",
      fileWith({ version: PROJECT_VERSION + 1 }),
      PROJECT_MESSAGES.newer,
    ],
  ])("refuses %s", async (_, text, message) => {
    await expect(parseProject(text, loader().load)).rejects.toThrow(message);
  });

  it.each([
    ["is missing", {}],
    [
      "is not base64",
      { shot: { name: "a.png", type: "image/png", data: "@@@" } },
    ],
    ["is empty", { shot: { name: "a.png", type: "image/png", data: "" } }],
    [
      "has another type",
      { shot: { name: "a.png", type: "image/svg+xml", data: btoa("<svg/>") } },
    ],
  ])("refuses a project whose image %s", async (_, images) => {
    const text = fileWith({ design: designWith("shot"), images });
    await expect(parseProject(text, loader().load)).rejects.toThrow(
      PROJECT_MESSAGES.images,
    );
  });

  it("frees the images it decoded when a later one fails", async () => {
    const design = designWith("shot");
    const withBackground: Design = {
      ...design,
      background: {
        kind: "image",
        source: { type: "upload", imageId: "bg" },
      } as Design["background"],
    };
    const text = fileWith({
      design: withBackground,
      images: { shot: { name: "a.png", type: "image/png", data: btoa("png") } },
    });
    const { load } = loader();
    await expect(parseProject(text, load)).rejects.toThrow(
      PROJECT_MESSAGES.images,
    );
    const first = await load.mock.results[0]?.value;
    expect(load).toHaveBeenCalledTimes(1);
    expect(first.release).toHaveBeenCalled();
  });
});
