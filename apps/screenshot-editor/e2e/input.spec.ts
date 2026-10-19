import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/fixtures";
import {
  expectEmptyState,
  useAutoSize,
  confirmFileName,
} from "./helpers/editor";
import { makeSolidPng } from "./helpers/png";

// Synthetic clipboard and drag events are only dependable in Chromium.
test.skip(
  ({ browserName }) => browserName !== "chromium",
  "Synthetic paste and drop events need Chromium",
);

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expectEmptyState(page);
  await useAutoSize(page);
});

async function paste(page: Page, png: Buffer, name: string) {
  await page.evaluate(
    ({ base64, name }) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], name, { type: "image/png" }));
      // A real paste targets the focused element, or the body.
      const target = document.activeElement ?? document.body;
      target.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { base64: png.toString("base64"), name },
  );
}

test("pasting a screenshot adds it", async ({ page }) => {
  await paste(page, makeSolidPng(4000, 2500, [0, 128, 255, 255]), "image.png");
  const stage = page.getByTestId("design-stage");
  await expect(stage).toHaveAttribute("data-width", "1744");
  await expect(stage).toHaveAttribute("data-height", "1144");

  await page.getByRole("button", { name: "Export PNG 2×" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    confirmFileName(page),
  ]);
  // Pasted images are called "image.png", so the export gets a dated name.
  expect(download.suggestedFilename()).toMatch(
    /^Screenshot \d{4}-\d{2}-\d{2}\.png$/,
  );
});

/**
 * Dispatches dragenter, dragover and drop on the drop zone and reports which
 * of them the page cancelled. Cancelling is what stops the browser from
 * opening the dropped file or link itself (synthetic events never run that
 * default action, so the test checks the cancellation directly).
 */
async function drop(page: Page, payload: { png?: string; uri?: string }) {
  return page.evaluate(({ png, uri }) => {
    const data = new DataTransfer();
    if (png) {
      const bytes = Uint8Array.from(atob(png), (char) => char.charCodeAt(0));
      data.items.add(new File([bytes], "dropped.png", { type: "image/png" }));
    }
    if (uri) data.setData("text/uri-list", uri);
    const target = document.querySelector('[data-testid="empty-state"]');
    if (!target) throw new Error("No drop zone");
    const cancelled: Record<string, boolean> = {};
    for (const type of ["dragenter", "dragover", "drop"]) {
      const event = new DragEvent(type, {
        dataTransfer: data,
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);
      cancelled[type] = event.defaultPrevented;
    }
    return cancelled;
  }, payload);
}

test("dropping a file adds it", async ({ page }) => {
  const cancelled = await drop(page, {
    png: makeSolidPng(640, 400, [0, 200, 0, 255]).toString("base64"),
  });
  expect(cancelled).toEqual({ dragenter: true, dragover: true, drop: true });
  await expect(page.getByTestId("design-stage")).toHaveAttribute(
    "data-width",
    "784",
  );
});

test("dropping a link shows a hint instead of leaving the page", async ({
  page,
}) => {
  const cancelled = await drop(page, {
    uri: "https://example.com/picture.png",
  });
  expect(cancelled).toEqual({ dragenter: true, dragover: true, drop: true });
  await expect(page.getByTestId("notice")).toContainText(
    "Drop a PNG, JPG or WebP file.",
  );
});
