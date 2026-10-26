import { expect, test } from "./helpers/fixtures";
import { expectEmptyState, stage, useAutoSize } from "./helpers/editor";

// The browser's own picker can't be driven from a test, so getDisplayMedia is
// replaced with a canvas stream of a known size and colour. It records
// whether the stream was stopped.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state = { stopped: false, cancel: false };
    (window as unknown as { capture: typeof state }).capture = state;
    navigator.mediaDevices.getDisplayMedia = async () => {
      if (state.cancel)
        throw new DOMException("Permission denied", "NotAllowedError");
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 800;
      const context = canvas.getContext("2d")!;
      const paint = () => {
        context.fillStyle = "#00ff00";
        context.fillRect(0, 0, canvas.width, canvas.height);
      };
      paint();
      const stream = canvas.captureStream(30);
      // A canvas stream only sends frames when the canvas changes.
      const timer = setInterval(paint, 30);
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => {
          state.stopped = true;
          clearInterval(timer);
          stop();
        };
      }
      return stream;
    };
  });
  await page.goto("./");
  await expectEmptyState(page);
  await useAutoSize(page);
});

const captureButton = (page: import("@playwright/test").Page) =>
  page.getByRole("banner").getByRole("button", { name: "Take screenshot" });

test("taking a screenshot opens it in the editor and stops the capture", async ({
  page,
}) => {
  await captureButton(page).click();
  await expect(page.getByTestId("empty-state")).toHaveCount(0);
  await expect(stage(page)).toHaveAttribute("data-width", /\d+/);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { capture: { stopped: boolean } }).capture
            .stopped,
      ),
    )
    .toBe(true);
  await expect(page.getByTestId("notice")).toHaveCount(0);
});

test("cancelling the picker changes nothing and shows no error", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as unknown as { capture: { cancel: boolean } }).capture.cancel =
      true;
  });
  await captureButton(page).click();
  await expectEmptyState(page);
  await expect(page.getByTestId("notice")).toHaveCount(0);
});

test("the screenshot button sits between Copy image and Export", async ({
  page,
}) => {
  const labels = await page
    .getByRole("banner")
    .getByRole("button")
    .evaluateAll((buttons) =>
      buttons.map(
        (button) => button.getAttribute("aria-label") ?? button.textContent,
      ),
    );
  const capture = labels.indexOf("Take screenshot");
  expect(labels[capture - 1]).toBe("Copy image");
  expect(labels[capture + 1]).toMatch(/Export/);
});
