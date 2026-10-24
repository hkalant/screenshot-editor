import type { Page } from "@playwright/test";
import {
  chooseFrame,
  expectDesignSize,
  expectEmptyState,
  RED,
  stage,
  upload,
  useAutoSize,
} from "./helpers/editor";
import { expect, test } from "./helpers/fixtures";
import { makeSolidPng } from "./helpers/png";

// On an auto canvas, the design is the screenshot plus 72 px all round.
const PADDING = 72;

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expectEmptyState(page);
  await useAutoSize(page);
});

const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Annotate" });
const cropBar = (page: Page) => page.getByRole("toolbar", { name: "Crop" });
const handle = (page: Page, name: string) =>
  page.getByRole("button", { name: `Resize from the ${name}` });

async function startCrop(page: Page) {
  await toolbar(page).getByRole("button", { name: "Crop screenshot" }).click();
  await expect(page.getByTestId("crop-box")).toBeVisible();
}

/** Presses an arrow key on a handle: each press is 1% of the original. */
async function pressOn(page: Page, name: string, key: string, times: number) {
  await handle(page, name).focus();
  for (let i = 0; i < times; i++) await page.keyboard.press(key);
}

test("crops the screenshot, keeps the original and undoes in one step", async ({
  page,
}) => {
  await upload(page, makeSolidPng(400, 300, RED));
  await startCrop(page);
  await expect(page.getByTestId("crop-size")).toHaveText("400 × 300");
  // The left half off.
  await pressOn(page, "left edge", "ArrowRight", 50);
  await expect(page.getByTestId("crop-size")).toHaveText("200 × 300");
  await cropBar(page).getByRole("button", { name: "Done" }).click();
  await expectDesignSize(page, 200 + 2 * PADDING, 300 + 2 * PADDING);

  // Cropping again starts from the whole original, with this crop.
  await startCrop(page);
  await expect(page.getByTestId("crop-size")).toHaveText("200 × 300");
  await cropBar(page).getByRole("button", { name: "Reset" }).click();
  await expect(page.getByTestId("crop-size")).toHaveText("400 × 300");
  // Esc leaves it as it was.
  await page.keyboard.press("Escape");
  await expectDesignSize(page, 200 + 2 * PADDING, 300 + 2 * PADDING);

  await page.getByRole("button", { name: "Undo" }).click();
  await expectDesignSize(page, 400 + 2 * PADDING, 300 + 2 * PADDING);
  await page.getByRole("button", { name: "Redo" }).click();
  await expectDesignSize(page, 200 + 2 * PADDING, 300 + 2 * PADDING);
});

test("Enter crops, and annotations left outside are removed with a note", async ({
  page,
}) => {
  await upload(page, makeSolidPng(400, 300, RED));
  // A step on the left quarter of the screenshot.
  await toolbar(page).getByRole("button", { name: "Add step 1" }).click();
  const box = await stage(page).boundingBox();
  if (!box) throw new Error("No stage");
  const scale = box.width / (400 + 2 * PADDING);
  await page.mouse.click(
    box.x + (PADDING + 50) * scale,
    box.y + (PADDING + 150) * scale,
  );
  await toolbar(page).getByRole("button", { name: "Select and move" }).click();

  await startCrop(page);
  await pressOn(page, "left edge", "ArrowRight", 50);
  await page.keyboard.press("Enter");
  await expectDesignSize(page, 200 + 2 * PADDING, 300 + 2 * PADDING);
  await expect(page.getByTestId("notice")).toHaveText(
    /1 annotation was outside the crop and was removed\./,
  );
});

test("with a device frame, the crop keeps the device's shape", async ({
  page,
}) => {
  // Phone-shaped.
  await upload(page, makeSolidPng(390, 844, RED));
  await chooseFrame(page, "Phone");
  await startCrop(page);
  // Only the corners resize, so the shape can't change.
  await expect(handle(page, "left edge")).toHaveCount(0);
  await pressOn(page, "bottom right corner", "ArrowUp", 20);
  const [width, height] = (
    (await page.getByTestId("crop-size").textContent()) ?? ""
  )
    .split(" × ")
    .map(Number);
  expect(height).toBeLessThan(844);
  expect(width / height).toBeCloseTo(390 / 844, 2);
  await cropBar(page).getByRole("button", { name: "Done" }).click();
  await expect(
    page
      .getByRole("radiogroup", { name: "Frame", exact: true })
      .getByRole("radio", { name: "Phone", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
});
