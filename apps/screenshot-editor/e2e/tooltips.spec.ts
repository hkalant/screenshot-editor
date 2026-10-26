import { expect, test } from "./helpers/fixtures";
import { expectEmptyState, upload } from "./helpers/editor";
import { makeSolidPng } from "./helpers/png";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expectEmptyState(page);
});

test("the editor's controls use its own tooltips, not the browser's", async ({
  page,
}) => {
  await upload(page, makeSolidPng(400, 300, [0, 128, 255, 255]));
  // Only the video player's frame keeps a title, which names it.
  expect(
    await page
      .locator("[title]:not(iframe)")
      .evaluateAll((elements) =>
        elements.map((element) => element.outerHTML.slice(0, 120)),
      ),
  ).toEqual([]);
  await page.getByRole("button", { name: "Zoom in" }).hover();
  await expect(page.getByTestId("tooltip")).toHaveText("Zoom in");
});

test("a tooltip shows under the pointer and goes on a press", async ({
  page,
}) => {
  const menu = page.getByRole("button", { name: "Menu" });
  await menu.hover();
  const tip = page.getByTestId("tooltip");
  await expect(tip).toHaveText("Menu");
  await page.mouse.down();
  await expect(tip).toHaveCount(0);
  await page.mouse.up();
});
