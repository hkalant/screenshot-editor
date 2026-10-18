import { expect, test } from "./helpers/fixtures";
import {
  chooseFile,
  expectColor,
  expectDesignSize,
  expectEmptyState,
  exportPng,
  openTab,
  RED,
  setSlider,
  shadowOption,
  stage,
  upload,
  useAutoSize,
} from "./helpers/editor";
import {
  brightness,
  isRed,
  makeSolidPng,
  readPngSize,
  samplePixels,
} from "./helpers/png";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expectEmptyState(page);
  await useAutoSize(page);
});

test("uploads a screenshot and exports it at 2x with rounded corners", async ({
  page,
}) => {
  await chooseFile(
    page,
    /Welcome to Screenshot Editor/,
    makeSolidPng(1200, 750, RED),
  );
  // 1200 x 750 plus 72px default padding on each side.
  await expectDesignSize(page, 1344, 894);

  const first = await exportPng(page);
  expect(first.name).toBe("fixture-2x.png");
  expect(readPngSize(first.png)).toEqual({ width: 2688, height: 1788 });
  // The image starts at (144, 144) in export pixels; with a 15px (30 export px)
  // radius, the pixel just inside its corner is cut away.
  const [center, background, roundedCorner] = await samplePixels(
    page,
    first.png,
    [
      [1344, 894],
      [4, 4],
      [145, 145],
    ],
  );
  expect(isRed(center)).toBe(true);
  expect(background[3]).toBe(255);
  expect(isRed(background)).toBe(false);
  expect(isRed(roundedCorner)).toBe(false);
});

test("the chosen gradient and angle are what gets drawn", async ({ page }) => {
  await upload(page, makeSolidPng(400, 300, RED));
  const brookes = page.getByRole("button", { name: "Brookes" });
  await expect(brookes).toHaveAttribute("aria-pressed", "true");

  // At 135deg the top-left corner gets the first colour stop.
  const [brookesCorner] = await samplePixels(
    page,
    (await exportPng(page)).png,
    [[4, 4]],
  );
  expectColor(brookesCorner, "#424a52");

  // At 0deg the gradient runs bottom to top: the top gets the last stop.
  const angle = await setSlider(page, "Angle", "Home");
  await expect(angle).toHaveAttribute("aria-valuenow", "0");
  const turned = await exportPng(page);
  const { height } = readPngSize(turned.png);
  const [top, bottom] = await samplePixels(page, turned.png, [
    [4, 4],
    [4, height - 5],
  ]);
  expectColor(top, "#d10373");
  expectColor(bottom, "#424a52");

  // A preset brings its own colours and angle.
  const stone = page.getByRole("button", { name: "Stone" });
  await stone.click();
  await expect(stone).toHaveAttribute("aria-pressed", "true");
  await expect(brookes).toHaveAttribute("aria-pressed", "false");
  const [stoneCorner] = await samplePixels(page, (await exportPng(page)).png, [
    [4, 4],
  ]);
  expectColor(stoneCorner, "#eceded");
});

test("swapping the gradient colours flips the drawn background", async ({
  page,
}) => {
  await upload(page, makeSolidPng(400, 300, RED));
  const [before] = await samplePixels(page, (await exportPng(page)).png, [
    [4, 4],
  ]);
  expectColor(before, "#424a52");
  await page.getByRole("button", { name: "Swap colours" }).click();
  const [after] = await samplePixels(page, (await exportPng(page)).png, [
    [4, 4],
  ]);
  expectColor(after, "#d10373");
});

test("the shadow is drawn below a screenshot with rounded corners", async ({
  page,
}) => {
  await upload(page, makeSolidPng(1200, 750, RED));
  await page.getByRole("button", { name: "Stone" }).click(); // light background, so the shadow shows
  await openTab(page, "Style");

  // 20 export px below the bottom edge of the image, horizontally centred.
  const probe: [number, number] = [1344, (72 + 750) * 2 + 20];

  await shadowOption(page, "None").click();
  await expect(shadowOption(page, "None")).toHaveAttribute("data-state", "on");
  const [withoutShadow] = await samplePixels(
    page,
    (await exportPng(page)).png,
    [probe],
  );

  await page.getByRole("radio", { name: "Floating" }).click();
  await expect(page.getByRole("radio", { name: "Floating" })).toHaveAttribute(
    "data-state",
    "on",
  );
  const [withShadow] = await samplePixels(page, (await exportPng(page)).png, [
    probe,
  ]);

  expect(brightness(withShadow)).toBeLessThanOrEqual(
    0.9 * brightness(withoutShadow),
  );
});

test("clicking the active shadow option again keeps it selected", async ({
  page,
}) => {
  await upload(page, makeSolidPng(400, 300, RED));
  await openTab(page, "Style");
  const floating = page.getByRole("radio", { name: "Floating" });
  await floating.click();
  await floating.click();
  await expect(floating).toHaveAttribute("data-state", "on");
  await expect(stage(page)).toBeVisible();
});

test("the sample image loads", async ({ page }) => {
  await page.getByRole("button", { name: "Try a sample image" }).click();
  // The 2000 x 1354 sample is shown at 1600 x 1083, plus padding.
  await expectDesignSize(page, 1744, 1227);
  const { name, png } = await exportPng(page);
  expect(name).toBe("sample-screenshot-2x.png");
  expect(readPngSize(png)).toEqual({ width: 3488, height: 2454 });
});

test("replacing the image keeps the style", async ({ page }) => {
  await upload(page, makeSolidPng(400, 300, RED));
  await openTab(page, "Style");
  await setSlider(page, "Border width", "End");
  await expectDesignSize(page, 544, 444);
  await chooseFile(
    page,
    "Replace image",
    makeSolidPng(800, 600, [0, 0, 255, 255]),
    "second.png",
  );
  await expectDesignSize(page, 944, 744);
  await expect(
    page.getByRole("slider", { name: "Border width" }),
  ).toHaveAttribute("aria-valuenow", "24");
});

test("a large screenshot is downscaled and still exports sharp", async ({
  page,
}) => {
  // Longer than 3200px, so it is downscaled when loaded.
  await upload(page, makeSolidPng(4000, 2500, [0, 128, 255, 255]), "wide.png");
  await expectDesignSize(page, 1744, 1144);
  const { name, png } = await exportPng(page);
  expect(name).toBe("wide-2x.png");
  expect(readPngSize(png)).toEqual({ width: 3488, height: 2288 });
  const [center] = await samplePixels(page, png, [[1744, 1144]]);
  expectColor(center, "#0080ff", 4);
  expect(center[3]).toBe(255);
});

test("unsupported files are refused with a message", async ({ page }) => {
  await upload(page, Buffer.from("GIF89a"), "anim.gif", "image/gif");
  await expect(page.getByTestId("notice")).toContainText(
    "Unsupported file type",
  );
  await expectEmptyState(page);
});

test.describe("broken images", () => {
  // Browsers may log the decode failure; that is expected here.
  test.use({ allowedConsoleErrors: [/image|decode|corrupt|truncated/i] });

  test("an unreadable PNG shows an error", async ({ page }) => {
    await upload(page, Buffer.from("this is not a png"), "broken.png");
    await expect(page.getByTestId("notice")).toContainText(
      "Couldn't read that image",
    );
    await expectEmptyState(page);
  });
});

test("the More menu lists the tutorials", async ({ page }) => {
  await page.getByRole("button", { name: "More" }).click();
  const tutorials = page.getByRole("navigation", { name: "Tutorials" });
  const text = tutorials.getByRole("link", { name: "Read the text tutorial" });
  // The text tutorial is a Google Doc, opened in a new tab.
  await expect(text).toHaveAttribute(
    "href",
    /^https:\/\/docs\.google\.com\/document\/d\//,
  );
  await expect(text).toHaveAttribute("target", "_blank");
  // The video is still a placeholder: picking it just closes the menu.
  await tutorials
    .getByRole("link", { name: "Watch the video tutorial" })
    .click();
  await expect(tutorials).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
});

test("the More menu lists the shortcuts", async ({ page }) => {
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Undo", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Export", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Back" }).click();
  await expect(
    dialog.getByRole("button", { name: "Keyboard shortcuts" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("⌘/Ctrl + / opens and closes the shortcuts", async ({ page }) => {
  const dialog = page.getByRole("dialog");
  await page.keyboard.press("ControlOrMeta+Slash");
  await expect(dialog.getByText("Undo", { exact: true })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+Slash");
  await expect(dialog).toHaveCount(0);
});
