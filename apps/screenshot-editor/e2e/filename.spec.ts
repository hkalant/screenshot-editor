import {
  confirmFileName,
  expectEmptyState,
  exportButton,
  exportImage,
  RED,
  upload,
} from "./helpers/editor";
import { expect, test } from "./helpers/fixtures";
import { makeSolidPng } from "./helpers/png";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expectEmptyState(page);
  await upload(page, makeSolidPng(1200, 750, RED), "My Dashboard.png");
});

const dialog = (page: import("@playwright/test").Page) =>
  page.getByTestId("save-name-dialog");

test("export suggests the screenshot's name, selected, with the extension shown", async ({
  page,
}) => {
  await exportButton(page).click();
  const name = dialog(page).getByLabel("File name");
  await expect(name).toBeFocused();
  await expect(name).toHaveValue("My Dashboard");
  await expect(dialog(page)).toContainText(".png");
  await expect(dialog(page)).toContainText("PNG at 2×");
  // The whole name is selected, so typing replaces it.
  expect(
    await name.evaluate(
      (input: HTMLInputElement) => input.selectionEnd! - input.selectionStart!,
    ),
  ).toBe("My Dashboard".length);
});

test("export saves under the typed name, and offers it next time", async ({
  page,
}) => {
  const first = await exportImage(page, "Course page.png");
  expect(first.name).toBe("Course page.png");

  await exportButton(page).click();
  await expect(dialog(page).getByLabel("File name")).toHaveValue("Course page");
});

test("characters file systems refuse are removed", async ({ page }) => {
  const file = await exportImage(page, 'Q3: "final" / v2?');
  expect(file.name).toBe("Q3 final v2.png");
});

test("Cancel and Esc save nothing", async ({ page }) => {
  let downloads = 0;
  page.on("download", () => downloads++);
  await exportButton(page).click();
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  await expect(dialog(page)).toBeHidden();
  await exportButton(page).click();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await page.waitForTimeout(300);
  expect(downloads).toBe(0);
  await expect(exportButton(page)).toBeEnabled();
});

test("a project is saved under the typed name with .screenshot.json added once", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /^Save project/ }).click();
  await expect(dialog(page)).toContainText(".screenshot.json");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    confirmFileName(page, "Onboarding.screenshot.json"),
  ]);
  expect(download.suggestedFilename()).toBe("Onboarding.screenshot.json");
});

test.describe("with the system Save dialog", () => {
  test.use({ savePicker: true });

  test("export uses it instead of the editor's dialog", async ({ page }) => {
    // Stands in for Chrome's dialog: the user keeps the name and saves.
    await page.evaluate(() => {
      const record = window as unknown as {
        suggested?: string;
        written?: string;
      };
      (
        window as unknown as { showSaveFilePicker: unknown }
      ).showSaveFilePicker = async (options: { suggestedName: string }) => {
        record.suggested = options.suggestedName;
        return {
          name: options.suggestedName,
          createWritable: async () => ({
            write: async (blob: Blob) => {
              record.written = blob.type;
            },
            close: async () => {},
          }),
        };
      };
    });
    await exportButton(page).click();
    await expect
      .poll(() => page.evaluate(() => (window as { written?: string }).written))
      .toBe("image/png");
    expect(
      await page.evaluate(() => (window as { suggested?: string }).suggested),
    ).toBe("My Dashboard.png");
    await expect(dialog(page)).toHaveCount(0);
  });

  test("cancelling it saves nothing", async ({ page }) => {
    await page.evaluate(() => {
      (
        window as unknown as { showSaveFilePicker: unknown }
      ).showSaveFilePicker = async () => {
        throw new DOMException("Cancelled", "AbortError");
      };
    });
    let downloads = 0;
    page.on("download", () => downloads++);
    await exportButton(page).click();
    await page.waitForTimeout(300);
    expect(downloads).toBe(0);
    await expect(dialog(page)).toHaveCount(0);
    await expect(exportButton(page)).toBeEnabled();
  });
});
