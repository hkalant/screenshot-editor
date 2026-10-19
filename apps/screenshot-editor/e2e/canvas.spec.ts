import type { Page } from "@playwright/test";
import {
  chooseCanvasSize,
  chooseFrame,
  expectDesignSize,
  expectEmptyState,
  exportButton,
  exportImage,
  openTab,
  RED,
  stage,
  upload,
  useAutoSize,
} from "./helpers/editor";
import { expect, test } from "./helpers/fixtures";
import {
  isRed,
  isWebp,
  makeSolidPng,
  readJpegSize,
  readPngSize,
  samplePixels,
} from "./helpers/png";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expectEmptyState(page);
  await useAutoSize(page);
});

/** The autosaved design, read straight from IndexedDB. */
function savedDesign(page: Page) {
  return page.evaluate(
    () =>
      new Promise<unknown>((resolve) => {
        const open = indexedDB.open("screenshot-editor");
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("autosave")) return resolve(null);
          const request = db
            .transaction("autosave")
            .objectStore("autosave")
            .get("design");
          request.onsuccess = () => resolve(request.result?.design ?? null);
          request.onerror = () => resolve(null);
        };
      }),
  );
}

/** Width and height of any image the page can decode. */
function imageSize(page: Page, file: Buffer) {
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes]));
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  }, file.toString("base64"));
}

test("canvas size presets and custom sizes", async ({ page }) => {
  await upload(page, makeSolidPng(1200, 750, RED));
  await chooseCanvasSize(page, /^Open Graph image/);
  await expectDesignSize(page, 1200, 630);
  await expect(
    page.getByRole("button", { name: /^Canvas size: Open Graph image/ }),
  ).toBeVisible();
  const og = await exportImage(page);
  expect(readPngSize(og.data)).toEqual({ width: 2400, height: 1260 });

  // Custom starts from the current size.
  await page.getByRole("button", { name: /^Canvas size/ }).click();
  await page.getByRole("radio", { name: "Custom" }).click();
  const width = page.getByRole("spinbutton", { name: "Width" });
  await expect(width).toHaveValue("1200");
  await width.fill("1000");
  await width.press("Enter");
  await expectDesignSize(page, 1000, 630);

  const lock = page.getByRole("button", { name: "Lock aspect ratio" });
  await lock.click();
  await width.fill("2000");
  await width.press("Enter");
  await expectDesignSize(page, 2000, 1260);

  // The lock survives closing the menu, and keeps the ratio at the limits.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Canvas size/ }).click();
  await expect(lock).toHaveAttribute("aria-pressed", "true");
  await width.fill("100");
  await width.press("Enter");
  await expectDesignSize(page, 159, 100);
  // Growing back keeps the locked ratio, not the rounded 159 × 100 one.
  await width.fill("1000");
  await width.press("Enter");
  await expectDesignSize(page, 1000, 630);

  await page.getByRole("radio", { name: /^Auto/ }).click();
  await expectDesignSize(page, 1344, 894);
});

test("the export button keeps focus while it exports", async ({ page }) => {
  await upload(page, makeSolidPng(1200, 750, RED));
  const button = exportButton(page);
  await expect(button).toBeEnabled();
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");
  // Enter in the name dialog exports; focus then goes back to the button.
  await expect(page.getByLabel("File name")).toBeFocused();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.keyboard.press("Enter"),
  ]);
  await download.path();
  await expect(button).not.toHaveAttribute("aria-disabled");
  await expect(button).toBeFocused();
});

test("a short workspace still fits the canvas", async ({ page }) => {
  await upload(page, makeSolidPng(1200, 750, RED));
  await page.setViewportSize({ width: 1280, height: 200 });
  // The canvas refits a frame or two after the resize, so wait for it.
  await expect
    .poll(async () => {
      const box = await stage(page).boundingBox();
      const main = await page.locator("main").boundingBox();
      if (!box || !main) return false;
      return box.y >= main.y && box.y + box.height <= main.y + main.height;
    })
    .toBe(true);
});

// A 1200 x 750 shot in a macOS frame, plus 72px of padding on each side.
const FRAMED_W = 1344;
const FRAMED_H = 935;

test("undo and redo with the buttons and the keyboard", async ({ page }) => {
  await upload(page, makeSolidPng(1200, 750, RED));
  const undo = page.getByRole("button", { name: "Undo" });
  const redo = page.getByRole("button", { name: "Redo" });
  await expect(redo).toBeDisabled();

  await chooseFrame(page, "macOS");
  await expectDesignSize(page, FRAMED_W, FRAMED_H);
  await undo.click();
  await expectDesignSize(page, 1344, 894);
  await redo.click();
  await expectDesignSize(page, FRAMED_W, FRAMED_H);

  await page.keyboard.press("ControlOrMeta+z");
  await expectDesignSize(page, 1344, 894);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expectDesignSize(page, FRAMED_W, FRAMED_H);

  // Undoing the upload goes back to the empty state; redo brings it back.
  await undo.click();
  await undo.click();
  await expectEmptyState(page);
  // Then the switch to Auto, back to the Desktop default.
  await undo.click();
  await expect(
    page.getByRole("button", { name: /^Canvas size: Desktop/ }),
  ).toBeVisible();
  await expect(undo).toBeDisabled();
  await redo.click();
  await redo.click();
  await expectDesignSize(page, 1344, 894);
});

test("Delete removes the screenshot and undo brings it back", async ({
  page,
}) => {
  await upload(page, makeSolidPng(400, 300, RED));
  await expect(stage(page)).toBeVisible();
  // From the page itself nothing happens: only the focused canvas deletes.
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press("Backspace");
  await expect(stage(page)).toBeVisible();
  await stage(page).click();
  await expect(page.locator("[data-design-canvas]")).toBeFocused();
  await page.keyboard.press("Delete");
  await expectEmptyState(page);
  await page.keyboard.press("ControlOrMeta+z");
  await expectDesignSize(page, 544, 444);
});

test("the design is restored after a reload", async ({ page }) => {
  await upload(page, makeSolidPng(1200, 750, RED));
  await chooseFrame(page, "macOS");
  await expectDesignSize(page, FRAMED_W, FRAMED_H);
  await expect
    .poll(async () => {
      const design = (await savedDesign(page)) as {
        layers?: { frame?: { kind?: string }; imageId?: string | null }[];
      } | null;
      return design?.layers?.[0];
    })
    .toMatchObject({
      frame: { kind: "macos" },
      imageId: expect.any(String),
    });

  await page.reload();
  await expectDesignSize(page, FRAMED_W, FRAMED_H);
  // A restored design starts a fresh history.
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  const { data } = await exportImage(page);
  const [center] = await samplePixels(page, data, [[1200, 750]]);
  expect(isRed(center)).toBe(true);
});

test("an edit made just before a reload is kept", async ({ page }) => {
  await upload(page, makeSolidPng(1200, 750, RED));
  await expect
    .poll(async () => {
      const design = (await savedDesign(page)) as {
        layers?: { imageId?: string | null }[];
      } | null;
      return design?.layers?.[0]?.imageId ?? null;
    })
    .toEqual(expect.any(String));

  await openTab(page, "Style");
  const border = page.getByRole("slider", { name: "Border width" });
  await border.focus();
  for (let i = 0; i < 5; i += 1) await border.press("ArrowRight");
  await expect(border).toHaveAttribute("aria-valuenow", "15");
  // Quick arrow-key steps on a slider are one undo step.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(border).toHaveAttribute("aria-valuenow", "10");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(border).toHaveAttribute("aria-valuenow", "15");

  // Straight away, well inside the save delay.
  await page.reload();
  await openTab(page, "Style");
  await expect(
    page.getByRole("slider", { name: "Border width" }),
  ).toHaveAttribute("aria-valuenow", "15");
});

test("an edit is kept when the browser drops the writes made on close", async ({
  page,
}) => {
  await upload(page, makeSolidPng(1200, 750, RED));
  await expect
    .poll(async () => {
      const design = (await savedDesign(page)) as {
        layers?: { imageId?: string | null }[];
      } | null;
      return design?.layers?.[0]?.imageId ?? null;
    })
    .toEqual(expect.any(String));

  await openTab(page, "Style");
  const border = page.getByRole("slider", { name: "Border width" });
  await border.focus();
  for (let i = 0; i < 5; i += 1) await border.press("ArrowRight");
  await expect(border).toHaveAttribute("aria-valuenow", "15");
  // As WebKit sometimes does on a quick reload: no IndexedDB write made from
  // here on lands, neither the delayed save nor the one made on close.
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("dropped", "AbortError");
    };
  });
  await page.reload();
  await openTab(page, "Style");
  await expect(
    page.getByRole("slider", { name: "Border width" }),
  ).toHaveAttribute("aria-valuenow", "15");
});

test("a tab left untouched doesn't overwrite another tab's work", async ({
  page,
}) => {
  const savedImageId = async () => {
    const design = (await savedDesign(page)) as {
      layers?: { imageId?: string | null }[];
    } | null;
    return design?.layers?.[0]?.imageId ?? null;
  };
  // A second tab opens while nothing is saved, and is never touched.
  const other = await page.context().newPage();
  await other.goto("./");
  await expectEmptyState(other);

  await upload(page, makeSolidPng(1200, 750, RED));
  await expect.poll(savedImageId).toEqual(expect.any(String));

  // Hiding or closing it must not write its empty design over that work.
  await other.close({ runBeforeUnload: true });
  await page.reload();
  await expectDesignSize(page, 1344, 894);
  expect(await savedImageId()).toEqual(expect.any(String));
});

test("exports JPEG and WebP at other scales and remembers the choice", async ({
  page,
}) => {
  await upload(page, makeSolidPng(1200, 750, RED));
  await page.getByRole("button", { name: "Export options" }).click();
  await page.getByRole("radio", { name: "JPEG" }).click();
  await page.getByRole("radio", { name: "1×" }).click();
  await expect(page.getByTestId("export-size")).toContainText("1344 × 894 px");
  await page.keyboard.press("Escape");
  await expect(exportButton(page)).toHaveText("Export JPEG 1×");

  const jpeg = await exportImage(page);
  expect(jpeg.name).toBe("fixture.jpg");
  expect(readJpegSize(jpeg.data)).toEqual({ width: 1344, height: 894 });

  const webpSupported = await page.evaluate(() =>
    document
      .createElement("canvas")
      .toDataURL("image/webp")
      .startsWith("data:image/webp"),
  );
  await page.getByRole("button", { name: "Export options" }).click();
  const webp = page.getByRole("radio", { name: "WebP" });
  const note = page.getByTestId("webp-unavailable");
  if (!webpSupported) {
    await expect(webp).toBeDisabled();
    await expect(note).toHaveText(/WebP isn't available in this browser/);
    return;
  }
  await expect(note).toHaveCount(0);
  await webp.click();
  await page.getByRole("radio", { name: "1×" }).click();
  await page.keyboard.press("Escape");
  const webpFile = await exportImage(page);
  expect(webpFile.name).toBe("fixture.webp");
  expect(isWebp(webpFile.data)).toBe(true);
  expect(await imageSize(page, webpFile.data)).toEqual({
    width: 1344,
    height: 894,
  });

  await page.reload();
  await expect(exportButton(page)).toHaveText("Export WebP 1×");
});

test("very large exports are capped to what the browser allows", async ({
  page,
}) => {
  await upload(page, makeSolidPng(400, 300, RED));
  await page.getByRole("button", { name: /^Canvas size/ }).click();
  await page.getByRole("radio", { name: "Custom" }).click();
  const width = page.getByRole("spinbutton", { name: "Width" });
  const height = page.getByRole("spinbutton", { name: "Height" });
  await width.fill("4000");
  await width.press("Enter");
  await height.fill("4000");
  await height.press("Enter");
  await page.keyboard.press("Escape");
  await expectDesignSize(page, 4000, 4000);
  await page.getByRole("button", { name: "Export options" }).click();
  await expect(page.getByRole("radio", { name: "3×" })).toHaveCount(0);
  await page.getByRole("radio", { name: "2×" }).click();
  // 8,000 px a side is over the 16,777,216 px area limit: 4096 x 4096 instead.
  await expect(page.getByTestId("export-size")).toContainText("4096 × 4096 px");
});

test("the screenshot can be nudged and dragged on a fixed canvas", async ({
  page,
}) => {
  await upload(page, makeSolidPng(1200, 750, RED));
  await chooseCanvasSize(page, /^X post/);
  await expectDesignSize(page, 1600, 900);
  // The shot fits the 1456 x 756 space inside the padding: 1210 px wide,
  // centred, so its left edge is at 195 and x = 150 is background.
  const probe: [number, number] = [150 * 2, 450 * 2];
  const probeIsRed = async () => {
    const [pixel] = await samplePixels(page, (await exportImage(page)).data, [
      probe,
    ]);
    return isRed(pixel);
  };
  expect(await probeIsRed()).toBe(false);

  const canvas = page.locator("[data-design-canvas]");
  await canvas.focus();
  for (let i = 0; i < 5; i += 1) await page.keyboard.press("Shift+ArrowLeft");
  expect(await probeIsRed()).toBe(true);
  // Quick nudges are one undo step.
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await probeIsRed()).toBe(false);

  const box = await stage(page).boundingBox();
  if (!box) throw new Error("No stage");
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x - 60, center.y + 30, { steps: 6 });
  await page.mouse.up();
  expect(await probeIsRed()).toBe(true);
});

test("copies the design to the clipboard as a PNG", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Only Chromium lets tests grant clipboard access",
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await upload(page, makeSolidPng(400, 300, RED));
  const copyButton = page.getByRole("button", { name: "Copy image" });
  await copyButton.click();
  // Shown as a tooltip under the button, not as a notice.
  const tooltip = page.getByTestId("copied-tooltip");
  await expect(tooltip).toHaveText("Copied!");
  // It hangs below the top bar, over the canvas, and must not be hidden by it.
  await page.waitForTimeout(300);
  expect(
    await tooltip.evaluate((element) => {
      // Hit testing skips pointer-events: none, which the tooltip has.
      (element as HTMLElement).style.pointerEvents = "auto";
      const box = element.getBoundingClientRect();
      const top = document.elementFromPoint(
        box.left + box.width / 2,
        box.bottom - 2,
      );
      return element.contains(top);
    }),
  ).toBe(true);
  await expect(page.getByTestId("notice")).toHaveCount(0);
  const [button, tip] = [
    (await copyButton.boundingBox())!,
    (await tooltip.boundingBox())!,
  ];
  expect(tip.y).toBeGreaterThan(button.y + button.height);
  expect(
    Math.abs(tip.x + tip.width / 2 - (button.x + button.width / 2)),
  ).toBeLessThan(2);
  const copied = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const bitmap = await createImageBitmap(await item.getType("image/png"));
    return { width: bitmap.width, height: bitmap.height };
  });
  // (400 + 2 x 72) x (300 + 2 x 72) at the default 2x.
  expect(copied).toEqual({ width: 1088, height: 888 });

  // The tooltip goes away on its own.
  await expect(tooltip).toHaveCount(0);

  // The keyboard shortcut does the same when no text is selected.
  await page.keyboard.press("ControlOrMeta+c");
  await expect(tooltip).toHaveText("Copied!");
});

test("the empty editor shows a dotted drop area with the ways to start", async ({
  page,
}) => {
  const dropArea = page.getByRole("button", {
    name: /Welcome to Screenshot Editor/,
  });
  await expect(dropArea).toContainText(
    "To get started, do any of the following:",
  );
  await expect(dropArea).toContainText(
    "Drag and drop screenshots directly into the editor.",
  );
  await expect(dropArea).toContainText(
    "Paste a screenshot from your clipboard here with Ctrl/⌘ + V.",
  );
  await expect(dropArea).toHaveCSS("border-top-style", "dotted");
  await expect(dropArea).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(stage(page)).toHaveCount(0);
  await expect(page.getByRole("toolbar", { name: "Zoom" })).toHaveCount(0);
});

test("zooms the canvas from the keyboard", async ({ page }) => {
  await upload(page, makeSolidPng(1200, 750, RED));
  const level = page.getByTestId("zoom-level");
  const percent = async () =>
    Number((await level.textContent())!.trim().replace("%", ""));
  const fit = await percent();
  // Desktop Safari runs at 2x, so compare with the starting ratio, not 1.
  const ratio = () => page.evaluate(() => window.devicePixelRatio);
  const startRatio = await ratio();
  // Playwright's ControlOrMeta is ⌘ on a Mac and Ctrl elsewhere.
  await page.keyboard.press("ControlOrMeta+Equal");
  await expect.poll(percent).toBeGreaterThan(fit);
  const zoomed = await percent();
  await page.keyboard.press("ControlOrMeta+Shift+Equal");
  await expect.poll(percent).toBeGreaterThan(zoomed);
  await page.keyboard.press("ControlOrMeta+Minus");
  await expect.poll(percent).toBe(zoomed);
  await page.keyboard.press("ControlOrMeta+0");
  await expect.poll(percent).toBe(fit);
  // The browser's own page zoom is left alone.
  expect(await ratio()).toBe(startRatio);
});

test("zooms the canvas in, out and back to fit", async ({ page }) => {
  await upload(page, makeSolidPng(1200, 750, RED));
  await expectDesignSize(page, 1344, 894);
  const level = page.getByTestId("zoom-level");
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  const zoomOut = page.getByRole("button", { name: "Zoom out" });
  const reset = page.getByRole("button", { name: "Reset zoom" });
  const scroller = page.getByTestId("canvas-scroller");
  const percent = async () =>
    Number((await level.textContent())!.trim().replace("%", ""));
  const stageWidth = async () => (await stage(page).boundingBox())!.width;

  await expect(reset).toBeDisabled();
  const fit = await percent();
  expect(fit).toBeLessThan(100);
  const fitWidth = await stageWidth();

  await zoomIn.click();
  await expect.poll(percent).toBeGreaterThan(fit);
  expect(await stageWidth()).toBeGreaterThan(fitWidth);
  await expect(reset).toBeEnabled();

  // Up to 200%, where the design is bigger than the workspace and scrolls.
  while (await zoomIn.isEnabled()) await zoomIn.click();
  await expect(level).toHaveText("200%");
  expect(await stageWidth()).toBe(1344 * 2);
  expect(
    await scroller.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true);

  await zoomOut.click();
  await expect(level).toHaveText("150%");

  // Zooming only changes the view: the export keeps its own size.
  const { data } = await exportImage(page);
  expect(readPngSize(data)).toEqual({ width: 2688, height: 1788 });

  await reset.click();
  await expect.poll(percent).toBe(fit);
  await expect(reset).toBeDisabled();
  expect(await stageWidth()).toBe(fitWidth);

  // A new screenshot starts fitted again.
  await zoomIn.click();
  await upload(page, makeSolidPng(800, 600, RED), "second.png");
  await expectDesignSize(page, 944, 744);
  await expect(reset).toBeDisabled();
});
