import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { referencedImageIds } from "@/lib/design/refs";
import { createDefaultDesign, defaultShotStyle } from "@/lib/design/defaults";
import { getGradientPreset } from "@/lib/design/gradients";
import { SHADOW_PRESETS } from "@/lib/design/shadows";
import { fakeImage } from "@/lib/testing/fakeImage";
import {
  HISTORY_IMAGE_LIMIT,
  HISTORY_LIMIT,
  MERGE_WINDOW_MS,
  selectActiveImage,
  selectBackgroundImage,
  selectCanRedo,
  selectLastBackgroundUpload,
  selectCanUndo,
  selectShot,
  useEditorStore,
} from "./editor";

const state = () => useEditorStore.getState();
const shot = () => selectShot(state());

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  useEditorStore.setState(useEditorStore.getInitialState(), true);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Moves the clock past the merge window, so the next change is its own step. */
const later = () => vi.advanceTimersByTime(MERGE_WINDOW_MS + 1);

describe("editor store: canvas size", () => {
  it("starts on the Desktop size", () => {
    expect(state().design.canvas).toEqual({
      preset: "desktop",
      width: 1920,
      height: 1080,
    });
  });
});

describe("editor store: style", () => {
  it("sets an image and keeps the style settings", () => {
    state().setPadding(100);
    state().setRadius(20);
    state().setShadowPreset("soft");
    state().showError("old error");
    const image = fakeImage("a");
    state().setImage(image);
    expect(shot()).toMatchObject({
      imageId: "a",
      padding: 100,
      radius: 20,
      shadow: { preset: "soft" },
    });
    expect(state().notice).toBeNull();
    expect(selectActiveImage(state())).toBe(image);
  });

  it("clamps and rounds values", () => {
    state().setPadding(999);
    expect(shot().padding).toBe(200);
    state().setPadding(10.6);
    expect(shot().padding).toBe(11);
    state().setRadius(70);
    expect(shot().radius).toBe(64);
    state().resizeShot(9, 0.5, 0.5);
    expect(shot().scale).toBe(1.5);
    state().setPosition(-1, 2);
    expect(shot().position).toEqual({ x: 0, y: 1 });
    state().setBorder({ width: 30, opacity: 2 });
    expect(shot().border).toMatchObject({ width: 24, opacity: 1 });
    state().setBlur(-1);
    expect(state().design.backgroundFx).toEqual({ blur: 0 });
    state().setCustomSize(50, 9000);
    expect(state().design.canvas).toEqual({
      preset: "custom",
      width: 100,
      height: 4000,
    });
  });

  it("ignores values that aren't numbers or colours", () => {
    const before = state().design;
    state().setPadding(Number.NaN);
    state().setSolidColor("red");
    state().setBorder({ color: "#12" });
    state().setFrame({ kind: "tv" as never });
    state().setWallpaper("nope");
    state().setCanvasPreset("nope");
    expect(state().design).toBe(before);
    expect(state().past).toEqual([]);
  });

  it("applies gradient presets as linear copies", () => {
    state().applyGradientPreset("stone");
    const mist = getGradientPreset("stone");
    expect(state().design.background).toEqual({
      kind: "linear",
      presetId: "stone",
      angle: mist?.angle,
      stops: mist?.stops,
    });
  });

  it("edits a gradient stop and forgets the preset", () => {
    state().setGradientStop(1, "#ABCDEF");
    expect(state().design.background).toMatchObject({
      presetId: null,
      stops: [{ offset: 0 }, { offset: 1, color: "#abcdef" }],
    });
    state().setGradientStop(5, "#000000");
    expect(state().design.background).toMatchObject({ presetId: null });
  });

  it("swaps the gradient colours and can undo it", () => {
    state().setGradientStop(0, "#111111");
    state().setGradientStop(1, "#222222");
    state().swapGradientStops();
    expect(state().design.background).toMatchObject({
      stops: [
        { offset: 0, color: "#222222" },
        { offset: 1, color: "#111111" },
      ],
    });
    state().undo();
    expect(state().design.background).toMatchObject({
      stops: [{ color: "#111111" }, { color: "#222222" }],
    });
  });

  it("normalises angles", () => {
    state().setGradientAngle(400);
    expect(state().design.background).toMatchObject({ angle: 40 });
    state().setFromImage();
    expect(state().design.background).toEqual({ kind: "fromImage", angle: 40 });
    state().setFromImageAngle(-90);
    expect(state().design.background).toEqual({
      kind: "fromImage",
      angle: 270,
    });
  });

  it("switches background kinds", () => {
    state().setSolidColor("#FF0000");
    expect(state().design.background).toEqual({
      kind: "solid",
      color: "#ff0000",
    });
    state().setWallpaper("waves");
    expect(state().design.background).toEqual({
      kind: "image",
      source: { type: "wallpaper", wallpaperId: "waves" },
    });
    const upload = fakeImage("bg");
    state().setBackgroundImage(upload);
    expect(selectBackgroundImage(state())).toBe(upload);
    state().setTransparent();
    expect(state().design.background).toEqual({ kind: "transparent" });
  });

  it("keeps the last uploaded background available after switching away", () => {
    expect(selectLastBackgroundUpload(state())).toBeNull();
    const first = fakeImage("bg-1");
    const second = fakeImage("bg-2");
    state().setBackgroundImage(first);
    later();
    state().setBackgroundImage(second);
    later();
    state().setWallpaper("glow");
    expect(selectBackgroundImage(state())).toBeNull();
    expect(selectLastBackgroundUpload(state())).toBe(second);
    later();
    state().setTransparent();
    expect(selectLastBackgroundUpload(state())).toBe(second);
  });

  it("copies shadow presets, ignores the empty toggle value, and marks edits custom", () => {
    state().setShadowPreset("soft");
    expect(shot().shadow).toEqual(SHADOW_PRESETS.soft);
    expect(shot().shadow).not.toBe(SHADOW_PRESETS.soft);
    state().setShadowPreset("");
    expect(shot().shadow.preset).toBe("soft");
    state().setShadow({ blur: 30.4, color: "#FF00FF" });
    expect(shot().shadow).toEqual({
      ...SHADOW_PRESETS.soft,
      preset: "custom",
      blur: 30,
      color: "#ff00ff",
    });
  });

  it("sets canvas presets and goes back to auto", () => {
    state().setCanvasPreset("og");
    expect(state().design.canvas).toEqual({
      preset: "og",
      width: 1200,
      height: 630,
    });
    state().setCanvasPreset("auto");
    expect(state().design.canvas).toEqual({ preset: "auto" });
  });

  it("nudges only on fixed canvases", () => {
    state().setImage(fakeImage("a", 800, 400));
    state().setCanvasPreset("auto");
    state().nudge(10, 0);
    expect(shot().position).toEqual({ x: 0.5, y: 0.5 });
    state().setCustomSize(1000, 1000);
    state().nudge(10, -20);
    expect(shot().position).toEqual({ x: 0.51, y: 0.48 });
  });

  it("limits frame texts and keeps the image and canvas on reset", () => {
    state().setFrame({ kind: "browser", url: "x".repeat(200) });
    expect(shot().frame.url).toHaveLength(120);
    state().setImage(fakeImage("a"));
    state().setCanvasPreset("og");
    state().setSolidColor("#123456");
    state().setRadius(30);
    state().resetStyle();
    expect(shot()).toMatchObject({ ...defaultShotStyle(), imageId: "a" });
    expect(state().design.canvas.preset).toBe("og");
    expect(state().design.background).toEqual({
      kind: "solid",
      color: "#123456",
    });
  });
});

describe("editor store: history", () => {
  it("undoes and redoes", () => {
    state().setPadding(100);
    later();
    state().setRadius(30);
    expect(selectCanUndo(state())).toBe(true);
    state().undo();
    expect(shot()).toMatchObject({ padding: 100, radius: 15 });
    state().undo();
    expect(shot().padding).toBe(72);
    expect(selectCanUndo(state())).toBe(false);
    state().undo(); // nothing left: no change
    expect(shot().padding).toBe(72);
    state().redo();
    state().redo();
    expect(shot()).toMatchObject({ padding: 100, radius: 30 });
    expect(selectCanRedo(state())).toBe(false);
  });

  it("merges rapid changes of the same setting into one step", () => {
    state().setPadding(70);
    vi.advanceTimersByTime(200);
    state().setPadding(80);
    vi.advanceTimersByTime(200);
    state().setPadding(90);
    expect(state().past).toHaveLength(1);
    state().undo();
    expect(shot().padding).toBe(72);
  });

  it("starts a new step for another setting, after a pause, or after sealHistory", () => {
    state().setPadding(70);
    state().setRadius(20);
    expect(state().past).toHaveLength(2);
    later();
    state().setRadius(21);
    expect(state().past).toHaveLength(3);
    state().sealHistory();
    state().setRadius(22);
    expect(state().past).toHaveLength(4);
  });

  it("keeps frame and theme choices as separate steps, but merges typing", () => {
    state().setFrame({ kind: "macos" });
    state().setFrame({ kind: "browser" });
    state().setFrame({ theme: "dark" });
    expect(state().past).toHaveLength(3);
    state().setFrame({ url: "a" });
    state().setFrame({ url: "ab" });
    expect(state().past).toHaveLength(4);
    expect(state().past).toHaveLength(4);
  });

  it("drops a merged run that ends where it began, and keeps that state", () => {
    state().setPadding(80);
    state().setPadding(72);
    expect(state().past).toEqual([]);
    state().setPadding(70);
    expect(state().past).toHaveLength(1);
    state().undo();
    expect(shot().padding).toBe(72);
  });

  it("merges a whole gesture however slow it is", () => {
    state().beginGesture();
    state().setPadding(70);
    later();
    state().setPadding(90);
    later();
    state().setPadding(100);
    state().sealHistory();
    expect(state().past).toHaveLength(1);
    // After the gesture, the time limit applies again.
    state().setPadding(110);
    later();
    state().setPadding(120);
    expect(state().past).toHaveLength(3);
  });

  it("ignores changes that change nothing", () => {
    state().setPadding(72);
    state().setShadowPreset("medium");
    expect(state().past).toEqual([]);
    expect(state().revision).toBe(0);
  });

  it("clears redo on a new change and counts every revision", () => {
    state().setPadding(100);
    state().undo();
    expect(selectCanRedo(state())).toBe(true);
    state().setRadius(5);
    expect(selectCanRedo(state())).toBe(false);
    expect(state().revision).toBe(3);
  });

  it("keeps at most HISTORY_LIMIT steps", () => {
    for (let i = 0; i < HISTORY_LIMIT + 20; i += 1) {
      later();
      state().setPadding(i % 2 ? 10 : 20);
    }
    expect(state().past).toHaveLength(HISTORY_LIMIT);
  });

  it("can undo removing the screenshot", () => {
    const image = fakeImage("a");
    state().setImage(image);
    state().clearImage();
    expect(selectActiveImage(state())).toBeNull();
    state().pruneImages();
    expect(image.release).not.toHaveBeenCalled();
    state().undo();
    expect(selectActiveImage(state())).toBe(image);
  });

  it("frees images no design in the history uses", () => {
    const a = fakeImage("a");
    const b = fakeImage("b");
    state().setImage(a);
    state().setImage(b);
    state().pruneImages();
    // "a" is still reachable with undo.
    expect(a.release).not.toHaveBeenCalled();

    state().loadDesign(state().design, []); // clears the history
    state().pruneImages();
    expect(a.release).toHaveBeenCalledTimes(1);
    expect(b.release).not.toHaveBeenCalled();
    expect(Object.keys(state().images)).toEqual(["b"]);
  });

  it(`keeps no more than ${HISTORY_IMAGE_LIMIT} images alive through the history`, () => {
    const images = Array.from({ length: HISTORY_IMAGE_LIMIT + 3 }, (_, i) =>
      fakeImage(`img-${i}`),
    );
    for (const image of images) state().setImage(image);
    state().pruneImages();
    const kept = Object.keys(state().images);
    expect(kept).toHaveLength(HISTORY_IMAGE_LIMIT);
    expect(kept).toContain(`img-${HISTORY_IMAGE_LIMIT + 2}`);
    expect(images[0].release).toHaveBeenCalledTimes(1);
  });

  it("restores a design without history", () => {
    state().setPadding(100);
    const saved = {
      ...createDefaultDesign(),
      canvas: { preset: "auto" } as const,
    };
    const image = fakeImage("restored");
    saved.layers[0].imageId = "restored";
    state().loadDesign(saved, [image]);
    expect(state().past).toEqual([]);
    expect(selectActiveImage(state())).toBe(image);
  });
});

describe("editor store: interface state", () => {
  it("shows notices with new ids", () => {
    state().showError("Nope");
    expect(state().notice).toMatchObject({ kind: "error", message: "Nope" });
    const first = state().notice?.id;
    state().showInfo("Copied");
    expect(state().notice).toMatchObject({ kind: "info", message: "Copied" });
    expect(state().notice?.id).not.toBe(first);
    state().dismissNotice();
    expect(state().notice).toBeNull();
  });

  it("sanitises export options", () => {
    state().setExportOptions({ format: "webp", scale: 1 });
    expect(state().exportOptions).toMatchObject({ format: "webp", scale: 1 });
    state().setExportOptions({ scale: 7 as never, quality: 0.1 });
    expect(state().exportOptions).toMatchObject({ scale: 2, quality: 0.5 });
  });
});

describe("editor store: annotations", () => {
  const annotations = () => state().design.annotations;

  beforeEach(() => {
    state().setImage(fakeImage("shot", 1000, 500));
  });

  it("adds a second screenshot whose height follows its frame", () => {
    // Laptop-shaped, so it can have a window frame.
    state().setImage(fakeImage("shot", 1200, 750));
    state().addScreenshot(fakeImage("second", 800, 400));
    const [second] = annotations();
    expect(second).toMatchObject({
      kind: "screenshot",
      imageId: "second",
      width: 0.6,
      height: 0.3,
    });
    expect(state().selectedAnnotationId).toBe(second.id);
    expect(referencedImageIds(state().design)).toContain("second");

    // A window frame on the main screenshot goes round it too, in one step.
    state().setFrame({ kind: "macos" });
    const framed = annotations()[0];
    expect(framed.kind === "screenshot" && framed.height).toBeGreaterThan(0.3);
    state().undo();
    expect(annotations()[0]).toMatchObject({ height: 0.3 });
    expect(shot().frame.kind).toBe("none");

    // Resized, it keeps its shape.
    state().resizeScreenshot(second.id, 0.1, 0.1, 0.3);
    expect(annotations()[0]).toMatchObject({
      x: 0.1,
      y: 0.1,
      width: 0.3,
      height: 0.15,
    });
  });

  it("puts a new second screenshot in place of the one there already", () => {
    state().addScreenshot(fakeImage("second", 800, 400));
    const [second] = annotations();
    state().resizeScreenshot(second.id, 0.1, 0.1, 0.4);
    state().addScreenshot(fakeImage("third", 800, 800));
    expect(annotations()).toHaveLength(1);
    expect(annotations()[0]).toMatchObject({
      id: second.id,
      imageId: "third",
      x: 0.1,
      y: 0.1,
      width: 0.4,
      height: 0.4,
    });
    expect(referencedImageIds(state().design)).not.toContain("second");
    // Nor can it be copied.
    expect(state().pasteAnnotation(annotations()[0])).toBeNull();
    state().undo();
    expect(annotations()[0]).toMatchObject({ imageId: "second", height: 0.2 });
  });

  it("numbers steps in order and can start again from 1", () => {
    state().addStep({ x: 0.1, y: 0.1 });
    state().addStep({ x: 0.2, y: 0.1 });
    expect(annotations().map((a) => a.kind === "step" && a.number)).toEqual([
      1, 2,
    ]);
    expect(state().design.nextStep).toBe(3);
    state().resetStepCount();
    state().addStep({ x: 0.3, y: 0.1 });
    expect(annotations().at(-1)).toMatchObject({ kind: "step", number: 1 });
  });

  it("keeps a selection with any tool, and a new annotation clears it", () => {
    state().setAnnotationTool("step");
    state().addStep({ x: 0.1, y: 0.1 });
    const first = annotations()[0].id;
    state().selectAnnotation(first);
    expect(state().selectedAnnotationId).toBe(first);
    expect(state().annotationTool).toBe("step");
    state().addStep({ x: 0.5, y: 0.2 });
    expect(state().selectedAnnotationId).toBeNull();
    state().selectAnnotation(first);
    state().addShape("rect", { x: 0.1, y: 0.1, width: 0.2, height: 0.1 });
    expect(state().selectedAnnotationId).toBeNull();
    state().selectAnnotation(first);
    state().removeAnnotation(first);
    expect(annotations().map((a) => a.id)).not.toContain(first);
    expect(state().selectedAnnotationId).toBeNull();
  });

  it("pastes a copy just below and right of the original, and selects it", () => {
    state().addShape("rect", { x: 0.1, y: 0.1, width: 0.2, height: 0.1 });
    state().addStep({ x: 0.5, y: 0.2 });
    const [box, step] = annotations();
    const boxCopy = state().pasteAnnotation(box);
    expect(annotations().at(-1)).toMatchObject({
      id: boxCopy,
      kind: "shape",
      x: 0.12,
      y: 0.12,
      width: 0.2,
    });
    expect(state().selectedAnnotationId).toBe(boxCopy);
    // A copied step takes the next number.
    state().pasteAnnotation(step);
    expect(annotations().at(-1)).toMatchObject({ kind: "step", number: 2 });
    expect(state().design.nextStep).toBe(3);
    // One undo removes the copy.
    state().undo();
    expect(annotations()).toHaveLength(3);
  });

  it("resizes steps within limits, and new steps take the last size", () => {
    state().addStep({ x: 0.1, y: 0.1 });
    state().addStep({ x: 0.3, y: 0.1 });
    const [first] = annotations();
    expect(first).toMatchObject({ kind: "step", size: 1 });
    state().resizeStep(first.id, { x: 0.12, y: 0.1 }, 2);
    expect(annotations().find((a) => a.id === first.id)).toMatchObject({
      x: 0.12,
      size: 2,
    });
    state().addStep({ x: 0.5, y: 0.1 });
    expect(annotations().at(-1)).toMatchObject({ kind: "step", size: 2 });
    state().resizeStep(first.id, { x: 0.12, y: 0.1 }, 100);
    expect(annotations().find((a) => a.id === first.id)).toMatchObject({
      size: 4,
    });
    state().undo();
    expect(annotations().find((a) => a.id === first.id)).toMatchObject({
      size: 2,
    });
  });

  it("uses the chosen colour, and only the three allowed ones", () => {
    state().setAnnotationColor("#f9c909");
    state().addStep({ x: 0.1, y: 0.1 });
    state().setAnnotationColor("#ff0000");
    expect(state().annotationColor).toBe("#f9c909");
    expect(annotations()[0]).toMatchObject({ color: "#f9c909" });
  });

  it("adds filled or outline shapes, and changes the selected one", () => {
    state().setShapeFilled(true);
    state().addShape("rounded", { x: 0.1, y: 0.1, width: 0.2, height: 0.1 });
    const [shape] = annotations();
    expect(shape).toMatchObject({
      kind: "shape",
      shape: "rounded",
      filled: true,
    });
    state().selectAnnotation(shape.id);
    state().setShapeFilled(false);
    state().setAnnotationColor("#424a52");
    expect(annotations()[0]).toMatchObject({ filled: false, color: "#424a52" });
  });

  it("sets a step's number and counts on from the highest", () => {
    state().addStep({ x: 0.1, y: 0.1 });
    const [step] = annotations();
    state().setStepNumber(step.id, 7);
    expect(annotations()[0]).toMatchObject({ number: 7 });
    expect(state().design.nextStep).toBe(8);
    state().setStepNumber(step.id, 0);
    state().setStepNumber(step.id, 2.5);
    expect(annotations()[0]).toMatchObject({ number: 7 });
  });

  it("moves, nudges and removes annotations, with undo", () => {
    state().addStep({ x: 0.1, y: 0.1 });
    const [step] = annotations();
    later();
    state().moveAnnotation(step.id, { x: 0.5, y: 0.25 });
    expect(annotations()[0]).toMatchObject({ x: 0.5, y: 0.25 });
    later();
    // The screenshot is 1000 x 500 design px, drawn 1 : 1 on the canvas here.
    // Past the screenshot onto the background, but not off the canvas.
    state().nudgeAnnotation(step.id, 2000, 0);
    expect(annotations()[0].x).toBeGreaterThan(1);
    expect(annotations()[0].x).toBeLessThan(1.1);
    state().selectAnnotation(step.id);
    state().removeAnnotation(step.id);
    expect(annotations()).toEqual([]);
    expect(state().selectedAnnotationId).toBeNull();
    state().undo();
    expect(annotations()).toHaveLength(1);
  });

  it("adds arrows, moves their ends and keeps them on the canvas", () => {
    state().setAnnotationColor("#424a52");
    state().addArrow({ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.3 });
    // A zero-length arrow is no arrow.
    state().addArrow({ x: 0.2, y: 0.2 }, { x: 0.2, y: 0.2 });
    expect(annotations()).toHaveLength(1);
    const [arrow] = annotations();
    expect(arrow).toMatchObject({
      kind: "arrow",
      x: 0.1,
      y: 0.1,
      dx: 0.3,
      dy: 0.2,
      color: "#424a52",
    });
    later();
    state().setArrowEnds(arrow.id, { x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 });
    expect(annotations()[0]).toMatchObject({ dx: 0.4, dy: 0 });
    later();
    // The canvas is the 1000 x 500 screenshot plus padding: the whole arrow
    // stops at its right edge.
    state().nudgeAnnotation(arrow.id, 5000, 0);
    const moved = annotations()[0];
    expect(moved.kind === "arrow" && moved.x + moved.dx).toBeLessThan(1.2);
    expect(moved.x).toBeGreaterThan(0.6);
    state().undo();
    state().undo();
    expect(annotations()[0]).toMatchObject({ x: 0.1, dx: 0.3, dy: 0.2 });
  });

  it("styles and bends arrows, and new arrows take the last style", () => {
    state().addArrow({ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.3 });
    const [arrow] = annotations();
    expect(arrow).toMatchObject({ style: "solid", bend: 0 });
    state().setArrowStyle(arrow.id, "halo");
    expect(annotations()[0]).toMatchObject({ style: "halo" });
    state().addArrow({ x: 0.5, y: 0.1 }, { x: 0.6, y: 0.3 });
    expect(annotations()[1]).toMatchObject({ style: "halo" });
    later();
    state().setArrowBend(arrow.id, 0.3);
    state().setArrowBend(arrow.id, 0.9);
    expect(annotations()[0]).toMatchObject({ bend: 0.5 });
    state().undo();
    expect(annotations()[0]).toMatchObject({ bend: 0 });
  });

  it("draws lines with the last end picked, never turning them into arrows", () => {
    state().addArrow({ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.3 }, true);
    const [line] = annotations();
    expect(line).toMatchObject({ kind: "arrow", style: "flat", bend: 0 });
    state().setArrowStyle(line.id, "bar");
    expect(annotations()[0]).toMatchObject({ style: "bar" });
    state().addArrow({ x: 0.5, y: 0.1 }, { x: 0.6, y: 0.3 }, true);
    state().addArrow({ x: 0.5, y: 0.4 }, { x: 0.6, y: 0.5 });
    expect(annotations()[1]).toMatchObject({ style: "bar" });
    // Arrows keep their own default.
    expect(annotations()[2]).toMatchObject({ style: "solid" });
    state().setArrowStyle(line.id, "halo");
    state().setArrowStyle(annotations()[2].id, "dot");
    expect(annotations()[0]).toMatchObject({ style: "bar" });
    expect(annotations()[2]).toMatchObject({ style: "solid" });
  });

  it("draws blur boxes with the last strength, and changes a box's strength", () => {
    state().addShape("blur", { x: 0.1, y: 0.1, width: 0.2, height: 0.1 });
    const [blur] = annotations();
    expect(blur).toMatchObject({ shape: "blur", intensity: 0.5 });
    later();
    state().setBlurIntensity(blur.id, 0.8);
    state().setBlurIntensity(blur.id, 1.7);
    expect(annotations()[0]).toMatchObject({ intensity: 1 });
    state().undo();
    expect(annotations()[0]).toMatchObject({ intensity: 0.5 });
    state().addShape("blur", { x: 0.5, y: 0.1, width: 0.2, height: 0.1 });
    expect(annotations()[1]).toMatchObject({ intensity: 1 });
    // Other shapes have no strength.
    state().addShape("rect", { x: 0.5, y: 0.4, width: 0.2, height: 0.1 });
    expect(annotations()[2]).not.toHaveProperty("intensity");
  });

  it("draws magnifiers with the last zoom, and changes a magnifier's zoom", () => {
    state().addShape("magnify", { x: 0.1, y: 0.1, width: 0.2, height: 0.1 });
    const [magnifier] = annotations();
    expect(magnifier).toMatchObject({ shape: "magnify", zoom: 2 });
    later();
    state().setMagnifyZoom(magnifier.id, 3);
    state().setMagnifyZoom(magnifier.id, 9);
    expect(annotations()[0]).toMatchObject({ zoom: 4 });
    state().undo();
    expect(annotations()[0]).toMatchObject({ zoom: 2 });
    state().addShape("magnify", { x: 0.5, y: 0.1, width: 0.2, height: 0.1 });
    expect(annotations()[1]).toMatchObject({ zoom: 4 });
    // Other shapes have no zoom.
    state().addShape("blur", { x: 0.5, y: 0.4, width: 0.2, height: 0.1 });
    expect(annotations()[2]).not.toHaveProperty("zoom");
  });

  it("reshapes magnifiers, keeping round ones square", () => {
    state().addShape("magnify", { x: 0.1, y: 0.1, width: 0.2, height: 0.1 });
    const [magnifier] = annotations();
    expect(magnifier).toMatchObject({ lens: "rounded" });
    state().selectAnnotation(magnifier.id);
    state().setMagnifyLens("circle");
    expect(annotations()[0]).toMatchObject({
      lens: "circle",
      x: 0.15,
      width: 0.1,
      height: 0.1,
    });
    state().selectAnnotation(null);
    state().addShape("magnify", { x: 0.5, y: 0.1, width: 0.1, height: 0.1 });
    expect(annotations()[1]).toMatchObject({ lens: "circle" });
  });

  it("draws inset magnifiers beside the area they enlarge, and moves that area", () => {
    state().setMagnifyInset(true);
    state().addShape("magnify", { x: 0.1, y: 0.1, width: 0.1, height: 0.05 });
    const [inset] = annotations();
    expect(inset).toMatchObject({
      from: { x: 0.15, y: 0.125 },
      width: 0.2,
      height: 0.1,
    });
    expect(inset.x).toBeGreaterThan(0.2);
    later();
    state().moveMagnifySource(inset.id, { x: 0.3, y: 0.2 });
    expect(annotations()[0]).toMatchObject({ from: { x: 0.3, y: 0.2 } });
    state().undo();
    expect(annotations()[0]).toMatchObject({ from: { x: 0.15, y: 0.125 } });
    // Back over the area it enlarges.
    state().selectAnnotation(inset.id);
    state().setMagnifyInset(false);
    const placed = annotations()[0];
    expect(placed).not.toHaveProperty("from");
    expect(placed.kind === "shape" && placed.x + placed.width / 2).toBeCloseTo(
      0.15,
    );
  });

  it("rounds a highlight's corners, and new highlights match", () => {
    state().addShape("highlight", { x: 0.1, y: 0.1, width: 0.2, height: 0.1 });
    const [highlight] = annotations();
    expect(highlight).toMatchObject({ shape: "highlight", rounded: false });
    state().selectAnnotation(highlight.id);
    state().setHighlightRounded(true);
    expect(annotations()[0]).toMatchObject({ rounded: true });
    state().selectAnnotation(null);
    state().addShape("highlight", { x: 0.5, y: 0.1, width: 0.2, height: 0.1 });
    expect(annotations()[1]).toMatchObject({ rounded: true });
  });

  it("starts a new screenshot without the old one's annotations", () => {
    state().addStep({ x: 0.1, y: 0.1 });
    state().setImage(fakeImage("other"));
    expect(annotations()).toEqual([]);
    expect(state().design.nextStep).toBe(1);
  });
});

describe("editor store: cropping", () => {
  beforeEach(() => {
    state().setImage(fakeImage("shot", 1000, 500));
  });

  it("crops the screenshot in one step, keeping annotations over the same spot", () => {
    state().addStep({ x: 0.75, y: 0.1 });
    state().addStep({ x: 0.1, y: 0.1 });
    state().startCrop();
    expect(state().cropping).toBe(true);
    state().applyCrop({ x: 0.5, y: 0, width: 0.5, height: 0.5 });
    expect(state().cropping).toBe(false);
    expect(shot().crop).toEqual({ x: 0.5, y: 0, width: 0.5, height: 0.5 });
    expect(selectActiveImage(state())).toMatchObject({
      width: 500,
      height: 250,
    });
    // The step on the left half went with it.
    expect(state().design.annotations).toHaveLength(1);
    expect(state().design.annotations[0]).toMatchObject({ x: 0.5, y: 0.2 });
    expect(state().notice?.message).toBe(
      "1 annotation was outside the crop and was removed.",
    );
    // The original is kept, and saved.
    expect(referencedImageIds(state().design)).toEqual(["shot"]);

    state().undo();
    expect(shot().crop).toBeNull();
    expect(state().design.annotations).toHaveLength(2);
    expect(selectActiveImage(state())).toMatchObject({ width: 1000 });
  });

  it("crops again from the original, and the whole image is no crop", () => {
    state().applyCrop({ x: 0.5, y: 0, width: 0.5, height: 0.5 });
    state().applyCrop({ x: 0, y: 0, width: 1, height: 1 });
    expect(shot().crop).toBeNull();
  });

  it("swaps a device that no longer fits, and a new screenshot has no crop", () => {
    state().setImage(fakeImage("phone", 400, 860));
    state().setFrame({ kind: "phone" });
    state().applyCrop({ x: 0, y: 0, width: 1, height: 0.3 });
    expect(shot().frame.kind).not.toBe("phone");
    expect(state().notice?.message).toMatch(/^The frame changed to/);
    state().setImage(fakeImage("next", 800, 600));
    expect(shot().crop).toBeNull();
  });
});
