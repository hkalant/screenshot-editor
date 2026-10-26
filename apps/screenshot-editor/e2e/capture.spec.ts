import { expect, test } from "./helpers/fixtures";
import { expectEmptyState, stage, useAutoSize } from "./helpers/editor";

// The browser's own picker can't be driven from a test, so getDisplayMedia is
// replaced with a canvas stream of a known size and colour. It records
// whether the stream was stopped.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state = {
      stopped: false,
      cancel: false,
      focus: [] as string[],
    };
    // Records what the editor asks of the picker's focus switch.
    const Controller = (
      window as unknown as {
        CaptureController?: {
          prototype: { setFocusBehavior: (behavior: string) => void };
        };
      }
    ).CaptureController;
    if (Controller)
      Controller.prototype.setFocusBehavior = (behavior) =>
        state.focus.push(behavior);
    (window as unknown as { capture: typeof state }).capture = state;
    // Set on the prototype: setting it on navigator.mediaDevices from an init
    // script didn't take in WebKit.
    const fake = async () => {
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
    Object.defineProperty(MediaDevices.prototype, "getDisplayMedia", {
      configurable: true,
      value: fake,
    });
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

test("the editor stays in front after a tab is picked", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Only Chrome has CaptureController");
  await captureButton(page).click();
  await expect(page.getByTestId("empty-state")).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { capture: { focus: string[] } }).capture.focus,
    ),
  ).toEqual(["no-focus-change"]);
});

test("without ImageCapture the frame comes from a video", async ({ page }) => {
  // As in Firefox and Safari.
  await page.evaluate(() => {
    delete (window as { ImageCapture?: unknown }).ImageCapture;
  });
  await captureButton(page).click();
  await expect(page.getByTestId("empty-state")).toHaveCount(0);
  await expect(page.getByTestId("notice")).toHaveCount(0);
});

test("the screenshot button names itself in a tooltip on hover", async ({
  page,
}) => {
  await captureButton(page).hover();
  await expect(page.getByTestId("toolbar-tooltip")).toHaveText(
    "Take screenshot",
  );
});
