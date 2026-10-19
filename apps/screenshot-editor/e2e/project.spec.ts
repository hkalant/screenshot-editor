import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import {
  exportButton,
  expectDesignSize,
  expectEmptyState,
  openTab,
  RED,
  setSlider,
  stage,
  upload,
  useAutoSize,
  confirmFileName,
} from "./helpers/editor";
import { expect, test, TOUR_SEEN_SCRIPT } from "./helpers/fixtures";
import { makeSolidPng } from "./helpers/png";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expectEmptyState(page);
  await useAutoSize(page);
});

const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Annotate" });

async function download(page: Page, click: () => Promise<void>) {
  const [file] = await Promise.all([page.waitForEvent("download"), click()]);
  return {
    name: file.suggestedFilename(),
    data: await readFile(await file.path()),
  };
}

const exportOptions = (page: Page) =>
  page.getByRole("button", { name: "Export options" });

test("the original screenshot downloads exactly as it was imported", async ({
  page,
}) => {
  const original = makeSolidPng(1200, 750, RED);
  await upload(page, original, "My Dashboard.png");
  // Styling doesn't touch the original.
  await openTab(page, "Style");
  await setSlider(page, "Padding", "End");
  await exportOptions(page).click();
  await expect(page.getByTestId("original-size")).toContainText(
    "1200 × 750 px PNG",
  );
  const file = await download(page, () =>
    page.getByRole("button", { name: "Download original" }).click(),
  );
  expect(file.name).toBe("my-dashboard-original.png");
  expect(file.data.equals(original)).toBe(true);
});

test("Export both downloads the design and the original", async ({ page }) => {
  await upload(page, makeSolidPng(1200, 750, RED), "My Dashboard.png");
  await exportOptions(page).click();
  const names: string[] = [];
  page.on("download", (file) => names.push(file.suggestedFilename()));
  await page.getByRole("button", { name: "Export both" }).click();
  await confirmFileName(page);
  await expect.poll(() => names.length).toBe(2);
  expect(names).toEqual([
    expect.stringMatching(/^My Dashboard\.(png|jpg|webp)$/),
    "my-dashboard-original.png",
  ]);
});

test("a saved project reopens with everything still editable", async ({
  page,
  browser,
  baseURL,
}) => {
  await upload(page, makeSolidPng(1200, 750, RED), "My Dashboard.png");
  await openTab(page, "Style");
  await setSlider(page, "Padding", "Home");
  await expectDesignSize(page, 1200, 750);
  // A numbered step on the screenshot.
  await toolbar(page).getByRole("button", { name: "Add step 1" }).click();
  const box = (await stage(page).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(
    toolbar(page).getByRole("button", { name: "Add step 2" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: /^Save project/ }).click();
  const saved = await download(page, () => confirmFileName(page));
  expect(saved.name).toBe("My Dashboard.screenshot.json");
  const project = JSON.parse(saved.data.toString("utf8"));
  expect(project.format).toBe("screenshot-editor-project");
  expect(project.design.annotations).toHaveLength(1);
  expect(Object.keys(project.images)).toHaveLength(1);

  // Open it in a fresh editor: a new browser context, with nothing saved.
  const fresh = await browser.newContext({ baseURL });
  await fresh.addInitScript(TOUR_SEEN_SCRIPT);
  const other = await fresh.newPage();
  await other.goto("./");
  await expectEmptyState(other);
  await other.getByRole("button", { name: "More" }).click();
  const chooser = other.waitForEvent("filechooser");
  await other.getByRole("button", { name: /^Open project/ }).click();
  await (
    await chooser
  ).setFiles({
    name: saved.name,
    mimeType: "application/json",
    buffer: saved.data,
  });

  await expectDesignSize(other, 1200, 750);
  await expect(
    toolbar(other).getByRole("button", { name: "Add step 2" }),
  ).toBeVisible();
  await expect(other.getByText("Project opened.")).toBeVisible();
  await expect(exportButton(other)).toBeEnabled();
  // Opening is one undo step.
  await other.getByRole("button", { name: "Undo" }).click();
  await expectEmptyState(other);
  await fresh.close();
});

test("a project file picked like an image opens as a project", async ({
  page,
}) => {
  await upload(page, makeSolidPng(1200, 750, RED));
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: /^Save project/ }).click();
  const saved = await download(page, () => confirmFileName(page));
  await page.keyboard.press("Escape");
  await openTab(page, "Style");
  await setSlider(page, "Padding", "Home");
  await expectDesignSize(page, 1200, 750);

  await page.getByTestId("file-input").setInputFiles({
    name: saved.name,
    mimeType: "application/json",
    buffer: saved.data,
  });
  await expectDesignSize(page, 1344, 894);
});

test("a broken project file explains itself", async ({ page }) => {
  await page.getByRole("button", { name: "More" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /^Open project/ }).click();
  await (
    await chooser
  ).setFiles({
    name: "broken.screenshot.json",
    mimeType: "application/json",
    buffer: Buffer.from("{not json"),
  });
  await expect(
    page.getByText("This project file can't be opened."),
  ).toBeVisible();
});
