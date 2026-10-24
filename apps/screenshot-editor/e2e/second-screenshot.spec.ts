import type { Page } from "@playwright/test";
import {
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
const sameFrame = (page: Page) =>
  tool(page, "Same frame as the main screenshot");

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

test("a second screenshot is added over the main one, and undone", async ({
  page,
}) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await addSecond(page, makeSolidPng(400, 300, [...BLUE]));
  // With no window frame on the main screenshot, there's none to share.
  await expect(sameFrame(page)).toBeDisabled();
  const [second, main] = await pixelsOnImage(page, [
    [0.85, 0.3],
    [0.2, 0.8],
  ]);
  expectColor(second, "#0000ff", 12);
  expect(isRed(main)).toBe(true);

  await page.getByRole("button", { name: "Undo" }).click();
  const [gone] = await pixelsOnImage(page, [[0.85, 0.3]]);
  expect(isRed(gone)).toBe(true);
});

test("a second screenshot shares the main one's frame and is kept after a reload", async ({
  page,
}) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await chooseFrame(page, "macOS browser");
  await addSecond(page, makeSolidPng(400, 300, [...BLUE]));
  await expect(sameFrame(page)).toHaveAttribute("aria-pressed", "true");
  const address = toolbar(page).getByRole("textbox", {
    name: "Address of the second screenshot",
  });
  await expect(address).toBeVisible();
  await address.fill("grades.example.ac.uk");

  // Out of the frame, it has no address.
  await sameFrame(page).click();
  await expect(sameFrame(page)).toHaveAttribute("aria-pressed", "false");
  await expect(address).toHaveCount(0);
  await sameFrame(page).click();
  await expect(address).toHaveValue("grades.example.ac.uk");

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
