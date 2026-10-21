import type { Page } from "@playwright/test";
import {
  chooseFile,
  expectColor,
  expectDesignSize,
  expectEmptyState,
  exportImage,
  openSections,
  openStyleSections,
  RED,
  setSlider,
  shadowOption,
  upload,
  useAutoSize,
} from "./helpers/editor";
import { expect, test } from "./helpers/fixtures";
import { brightness, isRed, makeSolidPng, samplePixels } from "./helpers/png";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expectEmptyState(page);
  await useAutoSize(page);
});

const backgroundType = (page: Page, name: string) =>
  page
    .getByRole("radiogroup", { name: "Background type" })
    .getByRole("radio", { name, exact: true });

async function cornerPixel(page: Page) {
  const [pixel] = await samplePixels(page, (await exportImage(page)).data, [
    [4, 4],
  ]);
  return pixel;
}

test("solid and uploaded backgrounds are what gets exported", async ({
  page,
}) => {
  await upload(page, makeSolidPng(400, 300, RED));

  await backgroundType(page, "Solid").click();
  await expect(backgroundType(page, "Solid")).toHaveAttribute(
    "data-state",
    "on",
  );
  await page.getByRole("button", { name: /^Colour:/ }).click();
  const hex = page.getByLabel("Hex");
  await hex.fill("#123456");
  await hex.press("Enter");
  await page.keyboard.press("Escape");
  expectColor(await cornerPixel(page), "#123456", 2);

  await expect(backgroundType(page, "None")).toHaveCount(0);

  await backgroundType(page, "Image").click();
  await chooseFile(
    page,
    "Upload background",
    makeSolidPng(300, 200, [0, 0, 255, 255]),
    "sky.png",
  );
  expectColor(await cornerPixel(page), "#0000ff", 4);
  await setSlider(page, "Blur", "End");
  expectColor(await cornerPixel(page), "#0000ff", 8);

  // Back to Image: a gradient again, with the upload still on offer.
  await backgroundType(page, "Image").click();
  await expect(page.getByRole("button", { name: "Brookes" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Uploaded image" }),
  ).toBeVisible();
});

test("the Image background offers gradients and an upload", async ({
  page,
}) => {
  await upload(page, makeSolidPng(400, 300, RED));
  await expect(backgroundType(page, "Image")).toHaveAttribute(
    "data-state",
    "on",
  );
  await expect(backgroundType(page, "Gradient")).toHaveCount(0);
  await expect(backgroundType(page, "From image")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Brookes" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Upload background" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Waves" })).toHaveCount(0);
});

test("JPEG exports fill transparency with white", async ({ page }) => {
  // A see-through screenshot: the background shows through it, and the
  // background is opaque, so sample where nothing is drawn under it.
  await upload(page, makeSolidPng(400, 300, [0, 0, 0, 0]));
  await page.getByRole("button", { name: "Export options" }).click();
  await page.getByRole("radio", { name: "JPEG" }).click();
  await page.keyboard.press("Escape");
  const [pixel] = await samplePixels(page, (await exportImage(page)).data, [
    [4, 4],
  ]);
  expect(pixel[3]).toBe(255);
});

test("window frames add a title bar above the screenshot", async ({ page }) => {
  // 1000 px wide: frame chrome at its base size.
  await upload(page, makeSolidPng(1000, 600, RED));
  await openStyleSections(page);
  const frame = (name: string) =>
    page
      .getByRole("radiogroup", { name: "Frame", exact: true })
      .getByRole("radio", { name, exact: true });

  await frame("macOS").click();
  await expectDesignSize(page, 1144, 778);
  const bar: [number, number] = [(72 + 500) * 2, (72 + 17) * 2];
  const inside: [number, number] = [(72 + 500) * 2, (72 + 34 + 300) * 2];
  const [lightBar, imagePixel] = await samplePixels(
    page,
    (await exportImage(page)).data,
    [bar, inside],
  );
  expect(isRed(lightBar)).toBe(false);
  expect(brightness(lightBar)).toBeGreaterThan(200);
  expect(isRed(imagePixel)).toBe(true);

  await page.getByRole("radio", { name: "Dark" }).click();
  const [darkBar] = await samplePixels(page, (await exportImage(page)).data, [
    bar,
  ]);
  expect(brightness(darkBar)).toBeLessThan(80);

  await page.getByLabel("Window title").fill("My app");
  await expect(frame("Browser")).toHaveCount(0);
  await frame("macOS browser").click();
  await expectDesignSize(page, 1144, 792);
  await page.getByLabel("Address").fill("example.com");

  await frame("Windows browser").click();
  await expectDesignSize(page, 1144, 792);
  await expect(page.getByLabel("Address")).toHaveValue("example.com");
  await expect(page.getByLabel("Window title")).toHaveCount(0);
  await expect(frame("Glass")).toHaveCount(0);
  await frame("None").click();
  await expectDesignSize(page, 1144, 744);
});

test("devices go around the screenshot and suggest themselves", async ({
  page,
}) => {
  // Phone shaped: 500 x 1000, so the phone's bezel is 18 px.
  await upload(page, makeSolidPng(500, 1000, RED));
  await openStyleSections(page);
  const frame = (name: string) =>
    page
      .getByRole("radiogroup", { name: "Frame", exact: true })
      .getByRole("radio", { name, exact: true });

  await expect(frame("Phone")).toHaveAccessibleDescription(
    /^Shaped like a phone screenshot\./,
  );
  await expect(frame("Laptop")).not.toHaveAccessibleDescription(/./);
  await frame("Phone").click();
  await expect(frame("Phone")).toHaveAttribute("aria-checked", "true");
  await expect(frame("None")).toHaveAttribute("aria-checked", "false");
  await expectDesignSize(page, 536 + 144, 1036 + 144);
  // Devices are always dark and have no border.
  await expect(page.getByRole("radio", { name: "Dark" })).toHaveCount(0);
  await expect(
    page.getByText("Devices are drawn without a border."),
  ).toBeVisible();

  const bezel: [number, number] = [(72 + 9) * 2, (72 + 518) * 2];
  const screen: [number, number] = [(72 + 268) * 2, (72 + 518) * 2];
  const [bezelPixel, screenPixel] = await samplePixels(
    page,
    (await exportImage(page)).data,
    [bezel, screen],
  );
  expect(brightness(bezelPixel)).toBeLessThan(60);
  expect(isRed(screenPixel)).toBe(true);

  // A laptop's base is wider than its screen and adds height below it.
  await frame("Laptop").click();
  await expectDesignSize(page, 628 + 144, 1054 + 144);
  await frame("None").click();
  await expectDesignSize(page, 644, 1144);
});

test("border and shadow", async ({ page }) => {
  await upload(page, makeSolidPng(400, 300, RED));
  await openStyleSections(page);

  // The border goes around the outside: the screenshot's edge stays red, and
  // the background just outside it turns lighter under the white border.
  const points: [number, number][] = [
    [(72 + 1) * 2, (72 + 150) * 2],
    [(72 - 2) * 2, (72 + 150) * 2],
  ];
  await setSlider(page, "Border width", "Home");
  const [, before] = await samplePixels(
    page,
    (await exportImage(page)).data,
    points,
  );
  await setSlider(page, "Border width", "End");
  const [edge, after] = await samplePixels(
    page,
    (await exportImage(page)).data,
    points,
  );
  expect(isRed(edge)).toBe(true);
  expect(brightness(after)).toBeGreaterThan(brightness(before) + 40);

  // The shadow comes from the presets only.
  for (const name of ["None", "Soft", "Medium", "Floating"])
    await expect(shadowOption(page, name)).toBeVisible();
  await expect(shadowOption(page, "Hard")).toHaveCount(0);
  await expect(shadowOption(page, "Medium")).toHaveAttribute(
    "data-state",
    "on",
  );
});

test("the padding slider changes the space around the screenshot", async ({
  page,
}) => {
  await upload(page, makeSolidPng(1200, 750, RED));
  await expectDesignSize(page, 1344, 894);
  await openStyleSections(page);
  await setSlider(page, "Padding", "End");
  await expectDesignSize(page, 1600, 1150);
  await setSlider(page, "Padding", "Home");
  await expectDesignSize(page, 1200, 750);
  await page.getByRole("button", { name: "Reset style" }).click();
  await expectDesignSize(page, 1344, 894);
});

test("double-clicking a slider's thumb returns it to its default", async ({
  page,
}) => {
  await upload(page, makeSolidPng(1200, 750, RED));
  await openStyleSections(page);
  const padding = await setSlider(page, "Padding", "Home");
  await expectDesignSize(page, 1200, 750);
  await padding.dblclick();
  await expect(padding).toHaveAttribute("aria-valuenow", "72");
  await expectDesignSize(page, 1344, 894);
  // The reset is one undo step.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(padding).toHaveAttribute("aria-valuenow", "0");

  // Delete on a focused thumb does the same.
  const opacity = await setSlider(page, "Border opacity", "End");
  await expect(opacity).toHaveAttribute("aria-valuenow", "100");
  await opacity.press("Delete");
  await expect(opacity).toHaveAttribute("aria-valuenow", "30");

  // The gradient angle goes back to the chosen gradient's own angle.
  await openSections(page, "Background");
  const angle = await setSlider(page, "Angle", "Home");
  await expect(angle).toHaveAttribute("aria-valuenow", "0");
  await angle.dblclick();
  await expect(angle).toHaveAttribute("aria-valuenow", "135");
});

test.describe("on a touchscreen", () => {
  test.use({ hasTouch: true });
  test("double-tapping a slider's thumb returns it to its default", async ({
    page,
  }) => {
    await upload(page, makeSolidPng(1200, 750, RED));
    await openStyleSections(page);
    const padding = await setSlider(page, "Padding", "End");
    const box = (await padding.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x, y);
    await expect(padding).toHaveAttribute("aria-valuenow", "72");
  });
});
