import { expect, test } from "./helpers/fixtures";
import { expectEmptyState, stage, upload, useAutoSize } from "./helpers/editor";
import { makeSolidPng } from "./helpers/png";

// The browser's own picker can't be driven from a test, so getDisplayMedia is
// replaced with a canvas stream of a known size and colour. It records
// whether the stream was stopped.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state = {
      stopped: false,
      cancel: false,
      calls: 0,
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
      state.calls += 1;
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
  page.getByRole("banner").getByRole("button", { name: "Capture screen" });

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
  const capture = labels.indexOf("Capture screen");
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
  await expect(page.getByTestId("tooltip")).toHaveText("Take screenshot");
});

const captures = (page: import("@playwright/test").Page) =>
  page.evaluate(
    () => (window as unknown as { capture: { calls: number } }).capture.calls,
  );

test("a capture over a plain screenshot replaces it without asking", async ({
  page,
}) => {
  await upload(page, makeSolidPng(400, 300, [0, 128, 255, 255]));
  await captureButton(page).click();
  await expect.poll(() => captures(page)).toBe(1);
  await expect(page.getByText("Replace the screenshot?")).toHaveCount(0);
});

test("a capture asks first when it would clear annotations", async ({
  page,
}) => {
  await upload(page, makeSolidPng(400, 300, [0, 128, 255, 255]));
  await page.getByTestId("second-screenshot-input").setInputFiles({
    name: "second.png",
    mimeType: "image/png",
    buffer: makeSolidPng(200, 150, [255, 0, 0, 255]),
  });
  await captureButton(page).click();
  const dialog = page.getByRole("dialog", { name: "Replace the screenshot?" });
  await expect(dialog).toContainText(
    "also clears the second screenshot and all annotations",
  );
  // Cancel keeps everything, and opens no picker.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  expect(await captures(page)).toBe(0);

  await captureButton(page).click();
  await dialog.getByRole("button", { name: "Capture screen" }).click();
  await expect.poll(() => captures(page)).toBe(1);
  await expect(dialog).toHaveCount(0);
  // The second screenshot went with it, so the next capture doesn't ask.
  await captureButton(page).click();
  await expect.poll(() => captures(page)).toBe(2);
  await expect(dialog).toHaveCount(0);
});
