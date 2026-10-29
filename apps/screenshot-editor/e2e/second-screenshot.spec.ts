import type { Page } from "@playwright/test";
import {
  chooseCanvasSize,
  chooseFrame,
  expectColor,
  expectEmptyState,
  exportImage,
  RED,
  stage,
  upload,
  useAutoSize,
} from "./helpers/editor";
import { expect, test } from "./helpers/fixtures";
import {
  isRed,
  makeSolidPng,
  makeStripedPng,
  samplePixels,
} from "./helpers/png";

// A 400 x 300 screenshot on an auto canvas with 72 px padding: the canvas is
// 544 x 444 and the screenshot starts at (72, 72). With no room beside it,
// a second screenshot goes over its right, 0.6 of its width wide: from 232
// to 472 px across and 0 to 180 px down (as 400 x 300 is 4:3).
const PADDING = 72;
const IMAGE = { width: 400, height: 300 };
const BLUE = [0, 0, 255, 255] as const;
const WHITE = [255, 255, 255, 255] as const;

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expectEmptyState(page);
  await useAutoSize(page);
});

const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Annotate" });
const tool = (page: Page, name: string) =>
  toolbar(page).getByRole("button", { name, exact: true });
const GREEN = [0, 200, 0, 255] as const;

async function addSecond(page: Page, png: Buffer) {
  await page.getByTestId("second-screenshot-input").setInputFiles({
    name: "second.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(
    page.getByRole("button", { name: "Delete second screenshot" }),
  ).toBeVisible();
}

/** Screen coordinates of a point given as fractions of the main screenshot. */
async function onImage(page: Page, fx: number, fy: number) {
  const box = await stage(page).boundingBox();
  if (!box) throw new Error("No stage");
  const scale = box.width / (IMAGE.width + 2 * PADDING);
  return {
    x: box.x + (PADDING + fx * IMAGE.width) * scale,
    y: box.y + (PADDING + fy * IMAGE.height) * scale,
  };
}

/** Export pixels at points given as fractions of the main screenshot (2x export). */
async function pixelsOnImage(page: Page, points: [number, number][]) {
  return samplePixels(
    page,
    (await exportImage(page)).data,
    points.map(([fx, fy]) => [
      (PADDING + fx * IMAGE.width) * 2,
      (PADDING + fy * IMAGE.height) * 2,
    ]),
  );
}

test("a second screenshot is added over the main one, replaced, and undone", async ({
  page,
}) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await addSecond(page, makeSolidPng(400, 300, [...BLUE]));
  const [second, main] = await pixelsOnImage(page, [
    [0.85, 0.3],
    [0.2, 0.8],
  ]);
  expectColor(second, "#0000ff", 12);
  expect(isRed(main)).toBe(true);
  // There's only one, so it can't be duplicated.
  await expect(
    page.getByRole("button", { name: "Duplicate second screenshot" }),
  ).toHaveCount(0);

  // Adding another puts it in the first one's place.
  await expect(tool(page, "Add second screenshot")).toHaveCount(0);
  await expect(tool(page, "Replace second screenshot")).toBeVisible();
  await addSecond(page, makeSolidPng(400, 300, [...GREEN]));
  const [replaced] = await pixelsOnImage(page, [[0.85, 0.3]]);
  expectColor(replaced, "#00c800", 12);

  await page.getByRole("button", { name: "Undo" }).click();
  const [back] = await pixelsOnImage(page, [[0.85, 0.3]]);
  expectColor(back, "#0000ff", 12);
  await page.getByRole("button", { name: "Undo" }).click();
  const [gone] = await pixelsOnImage(page, [[0.85, 0.3]]);
  expect(isRed(gone)).toBe(true);
  await expect(tool(page, "Add second screenshot")).toBeVisible();
});

test("where the browser can't capture the screen, the button opens the file picker", async ({
  page,
}) => {
  // As on phones.
  await page.addInitScript(() => {
    delete (MediaDevices.prototype as { getDisplayMedia?: unknown })
      .getDisplayMedia;
  });
  await page.goto("./");
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  const chooser = page.waitForEvent("filechooser");
  await tool(page, "Add second screenshot").click();
  await (
    await chooser
  ).setFiles({
    name: "second.png",
    mimeType: "image/png",
    buffer: makeSolidPng(400, 300, [...BLUE]),
  });
  await expect(
    page.getByRole("button", { name: "Delete second screenshot" }),
  ).toBeVisible();
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("a second screenshot has its own address in the sidebar and is kept after a reload", async ({
  page,
}) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await chooseFrame(page, "macOS browser");
  await page
    .getByRole("textbox", { name: "Address", exact: true })
    .fill("old.example.ac.uk");
  await addSecond(page, makeSolidPng(400, 300, [...BLUE]));
  // While it's selected, the sidebar's address is its own.
  const address = page.getByRole("textbox", {
    name: "Address of the second screenshot",
  });
  await expect(address).toHaveValue("");
  await address.fill("grades.example.ac.uk");
  // Clicking the main screenshot puts it back to the main one's.
  const main = await onImage(page, 0.2, 0.8);
  await page.mouse.click(main.x, main.y);
  await expect(
    page.getByRole("textbox", { name: "Address", exact: true }),
  ).toHaveValue("old.example.ac.uk");

  // Once the autosave has it.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<unknown>((resolve) => {
            const open = indexedDB.open("screenshot-editor");
            open.onerror = () => resolve(null);
            open.onsuccess = () => {
              const db = open.result;
              if (!db.objectStoreNames.contains("autosave"))
                return resolve(null);
              const request = db
                .transaction("autosave")
                .objectStore("autosave")
                .get("design");
              request.onsuccess = () =>
                resolve(request.result?.design?.annotations?.[0]?.url ?? null);
              request.onerror = () => resolve(null);
            };
          }),
      ),
    )
    .toBe("grades.example.ac.uk");
  await page.reload();
  await expect(stage(page)).toBeVisible();
  const at = await onImage(page, 0.85, 0.3);
  await page.mouse.click(at.x, at.y);
  await expect(
    page.getByRole("button", { name: "Delete second screenshot" }),
  ).toBeVisible();
  await expect(address).toHaveValue("grades.example.ac.uk");
});

test("a blur box over a second screenshot blurs that screenshot", async ({
  page,
}) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await addSecond(page, makeStripedPng(400, 300, 8, [...BLUE], [...WHITE]));
  await tool(page, "Blur").click();
  const from = await onImage(page, 0.65, 0.1);
  const to = await onImage(page, 1.1, 0.5);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  // The stripes run together into a pale blue, with no red from under it.
  const [inside] = await pixelsOnImage(page, [[0.9, 0.3]]);
  expect(inside[2]).toBeGreaterThan(200);
  expect(inside[0]).toBeGreaterThan(60);
  expect(inside[0]).toBeLessThan(230);
  expect(Math.abs(inside[0] - inside[1])).toBeLessThan(20);
});

test("a magnifier over a second screenshot enlarges that screenshot", async ({
  page,
}) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await addSecond(page, makeSolidPng(400, 300, [...GREEN]));
  await tool(page, "Magnifier").click();
  const from = await onImage(page, 0.65, 0.1);
  const to = await onImage(page, 1.1, 0.5);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  // Green from the second screenshot, not red from the main one.
  const [inside] = await pixelsOnImage(page, [[0.875, 0.3]]);
  expectColor(inside, "#00c800", 20);
});

test("with a second screenshot, the menu replaces all screenshots, and a hint says what it is", async ({
  page,
}) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  const menu = page.getByRole("dialog", { name: "Menu" });
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(
    menu.getByRole("button", { name: /^Replace screenshot/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await addSecond(page, makeSolidPng(400, 300, [...BLUE]));
  const hint = page.getByTestId("canvas-hint");
  await expect(hint).toHaveText(
    "The second screenshot is treated as an annotation",
  );
  await expect(hint).toHaveCount(0, { timeout: 8000 });
  // Replacing it doesn't say so again.
  await addSecond(page, makeSolidPng(400, 300, [...GREEN]));
  await expect(hint).toHaveCount(0);

  await page.getByRole("button", { name: "Menu" }).click();
  await expect(
    menu.getByRole("button", { name: /^Replace all screenshots/ }),
  ).toBeVisible();
  await expect(
    menu.getByRole("button", { name: /^Replace screenshot/ }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Delete second screenshot" }).click();
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(
    menu.getByRole("button", { name: /^Replace screenshot/ }),
  ).toBeVisible();
});

test("a second screenshot is cropped in place", async ({ page }) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await addSecond(page, makeSolidPng(400, 300, [...BLUE]));
  // It runs from 0.58 to 1.18 of the main screenshot's width.
  const [left] = await pixelsOnImage(page, [[0.7, 0.3]]);
  expectColor(left, "#0000ff", 12);

  await tool(page, "Crop second screenshot").click();
  await expect(page.getByTestId("crop-size")).toHaveText("400 × 300");
  await page.getByRole("button", { name: "Resize from the left edge" }).focus();
  for (let i = 0; i < 50; i++) await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("crop-size")).toHaveText("200 × 300");
  await page
    .getByRole("toolbar", { name: "Crop" })
    .getByRole("button", { name: "Done" })
    .click();

  // Still selected, with its left half gone and the right half where it was.
  await expect(
    page.getByRole("button", { name: "Delete second screenshot" }),
  ).toBeVisible();
  const [gone, kept] = await pixelsOnImage(page, [
    [0.7, 0.3],
    [1.05, 0.3],
  ]);
  expect(isRed(gone)).toBe(true);
  expectColor(kept, "#0000ff", 12);

  // Cropping again starts from its whole image.
  await tool(page, "Crop second screenshot").click();
  await expect(page.getByTestId("crop-size")).toHaveText("200 × 300");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Delete second screenshot" }),
  ).toBeVisible();
});

test("a phone screenshot beside a laptop one goes in a phone, and each has its own frame", async ({
  page,
}) => {
  await upload(page, makeSolidPng(1440, 900, RED));
  await chooseFrame(page, "macOS browser");
  await addSecond(page, makeSolidPng(390, 844, [...BLUE]));

  // Selected, the sidebar shows its frame: a phone, and no window frames.
  await expect(page.getByTestId("frame-for")).toHaveText(
    "You’re choosing a frame for the second screenshot.",
  );
  const secondFrame = page.getByRole("radiogroup", {
    name: "Frame of the second screenshot",
  });
  await expect(
    secondFrame.getByRole("radio", { name: "Phone", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    secondFrame.getByRole("radio", { name: "macOS browser", exact: true }),
  ).toBeDisabled();
  await secondFrame.getByRole("radio", { name: "None", exact: true }).click();
  await expect(
    secondFrame.getByRole("radio", { name: "None", exact: true }),
  ).toHaveAttribute("aria-checked", "true");

  // The main one keeps its own.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("frame-for")).toHaveText(
    "You’re choosing a frame for the main screenshot.",
  );
  const mainFrame = page.getByRole("radiogroup", {
    name: "Frame",
    exact: true,
  });
  await expect(
    mainFrame.getByRole("radio", { name: "macOS browser", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
});

// Over the right of the main one, a second screenshot is 180 px tall and
// starts at its top. Dropped 4 screen px off level with the main one's top,
// middle or bottom, it lines up there, unless Alt is held.
for (const { line, top, off } of [
  { line: "top", top: 0, off: 1 },
  { line: "middle", top: 60, off: -1 },
  { line: "bottom", top: 120, off: 1 },
]) {
  test(`a second screenshot dragged near the main one's ${line} lines up with it, unless Alt is held`, async ({
    page,
  }) => {
    await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
    await addSecond(page, makeSolidPng(400, 300, [...BLUE]));
    const box = await stage(page).boundingBox();
    if (!box) throw new Error("No stage");
    const scale = box.width / (IMAGE.width + 2 * PADDING);
    // Where its top is dropped, 4 screen px off level.
    const dropped = top + (off * 4) / scale;
    const drag = async (alt: boolean) => {
      // Grabbed by its middle, 90 px down.
      const from = await onImage(page, 0.85, 90 / IMAGE.height);
      const to = await onImage(page, 0.85, (90 + dropped) / IMAGE.height);
      if (alt) await page.keyboard.down("Alt");
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 8 });
      await page.mouse.up();
      if (alt) await page.keyboard.up("Alt");
    };
    // Blue just inside its top and bottom; just outside, where that's over
    // the main one, its shadow, not blue.
    const expectTopAt = async (at: number) => {
      const inside = [at + 1.5, at + 178.5];
      const outside = [at - 1.5, at + 181.5].filter(
        (y) => y > 0 && y < IMAGE.height,
      );
      const pixels = await pixelsOnImage(
        page,
        [...inside, ...outside].map((y) => [0.85, y / IMAGE.height]),
      );
      for (const pixel of pixels.slice(0, inside.length))
        expectColor(pixel, "#0000ff", 12);
      for (const pixel of pixels.slice(inside.length))
        expect(pixel[2]).toBeLessThan(128);
    };

    // With Alt held it stays where it's dropped. (First, as the top snap
    // leaves it where it was, with nothing to undo.)
    await drag(true);
    await expectTopAt(dropped);

    await page.getByRole("button", { name: "Undo" }).click();
    await drag(false);
    await expectTopAt(top);
  });
}

test("a second screenshot resizes about its centre from its corners", async ({
  page,
}) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await addSecond(page, makeSolidPng(400, 300, [...BLUE]));
  // Selected once added, so its corner handles are up.
  const handle = (corner: string) =>
    page.getByRole("button", {
      name: `Resize second screenshot from the ${corner} corner`,
    });
  const corner = handle("bottom right");
  await expect(corner).toBeVisible();
  // Its box on screen, from where its corner handles are: each reaches 8 px
  // inside it, and 20 px out.
  const frame = async () => {
    const from = await handle("top left").boundingBox();
    const to = await corner.boundingBox();
    if (!from || !to) throw new Error("No corners");
    const left = from.x + 20;
    const top = from.y + 20;
    return {
      width: to.x + 8 - left,
      height: to.y + 8 - top,
      centre: { x: (left + to.x + 8) / 2, y: (top + to.y + 8) / 2 },
    };
  };
  const before = await frame();

  // Its curve shows as the pointer comes close, and resting on it says what
  // it does.
  const curve = corner.getByTestId("resize-curve");
  await page.mouse.move(before.centre.x, before.centre.y);
  await expect(curve).toHaveCSS("opacity", "0");
  const grip = await corner.boundingBox();
  if (!grip) throw new Error("No corner");
  const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  await page.mouse.move(start.x, start.y);
  await expect(curve).not.toHaveCSS("opacity", "0");
  await expect(page.getByTestId("resize-tooltip")).toHaveText(
    "Drag to resize.",
  );

  // Halfway towards the centre: half the size, about the same centre.
  await page.mouse.down();
  await page.mouse.move(
    start.x - before.width / 4,
    start.y - before.height / 4,
    { steps: 8 },
  );
  await page.mouse.up();
  const after = await frame();
  // About half: its border stays as thick.
  expect(after.width / before.width).toBeGreaterThan(0.45);
  expect(after.width / before.width).toBeLessThan(0.6);
  expect(after.width / after.height).toBeCloseTo(
    before.width / before.height,
    1,
  );
  expect(after.centre.x).toBeCloseTo(before.centre.x, -1);
  expect(after.centre.y).toBeCloseTo(before.centre.y, -1);

  // One undo puts it back.
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  await page
    .getByRole("button", { name: "Delete second screenshot" })
    .waitFor();
  const undone = await frame();
  expect(undone.width).toBeCloseTo(before.width, 0);
});

test("over a second screenshot, the main one isn't outlined, and its corners show only near the pointer", async ({
  page,
}) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await chooseCanvasSize(page, /^Desktop/);
  const box = await stage(page).boundingBox();
  if (!box) throw new Error("No stage");
  // Away from where the second screenshot goes, over the main one.
  const onMain = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.7 };
  await page.mouse.move(onMain.x, onMain.y);
  const outline = page.getByTestId("shot-outline");
  await expect(outline).toBeVisible();

  // Selected once added, under a still pointer far from its corners: none
  // of its curves show.
  await addSecond(page, makeSolidPng(400, 300, [...BLUE]));
  const curves = page
    .getByRole("button", { name: /^Resize second screenshot from/ })
    .getByTestId("resize-curve");
  await expect(curves).toHaveCount(4);
  for (const curve of await curves.all())
    await expect(curve).toHaveCSS("opacity", "0");

  // Over the second screenshot, where it covers the main one.
  const from = await page
    .getByRole("button", {
      name: "Resize second screenshot from the top left corner",
    })
    .boundingBox();
  if (!from) throw new Error("No corner");
  await page.mouse.move(from.x + 40, from.y + 40, { steps: 4 });
  await expect(outline).toBeHidden();
  await page.mouse.move(onMain.x, onMain.y, { steps: 4 });
  await expect(outline).toBeVisible();
});
