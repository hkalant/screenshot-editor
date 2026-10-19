import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import {
  expectDesignSize,
  expectEmptyState,
  RED,
  upload,
} from "./helpers/editor";
import { expect, test } from "./helpers/fixtures";
import { makeSolidPng, readPngSize } from "./helpers/png";

test("a new design starts on the Desktop size, listed above Auto", async ({
  page,
}) => {
  await page.goto("./");
  await expectEmptyState(page);
  const sizeButton = page.getByRole("button", { name: /^Canvas size/ });
  await expect(sizeButton).toHaveAccessibleName(
    "Canvas size: Desktop 1920 × 1080",
  );
  await upload(page, makeSolidPng(1200, 750, RED));
  await expectDesignSize(page, 1920, 1080);

  await sizeButton.click();
  const options = page.locator('[aria-label="Canvas size"]').getByRole("radio");
  await expect(options.nth(0)).toHaveAccessibleName(/^Desktop/);
  await expect(options.nth(0)).toHaveAttribute("aria-checked", "true");
  await expect(options.nth(1)).toHaveAccessibleName(
    /^Auto\s*Fits the screenshot and padding/,
  );
  await expect(options.nth(2)).toHaveAccessibleName(/^X post/);
});

test("the theme can be switched and is remembered", async ({ page }) => {
  await page.goto("./");
  await expectEmptyState(page);
  const html = page.locator("html");
  const toggle = page.getByRole("button", { name: /^Theme:/ });
  await expect(toggle).toHaveAccessibleName("Theme: System");
  await toggle.click();
  await expect(toggle).toHaveAccessibleName("Theme: Light");
  await expect(html).not.toHaveClass(/\bdark\b/);
  await toggle.click();
  await expect(toggle).toHaveAccessibleName("Theme: Dark");
  await expect(html).toHaveClass(/\bdark\b/);

  // Applied before the page renders, on every page.
  await page.goto("./");
  await expect(html).toHaveClass(/\bdark\b/);
});

test("the system theme follows the operating system", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("./");
  await expectEmptyState(page);
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
});

/** A one-finger swipe from one point to another, as real touch events. */
async function swipe(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (
    type: "touchStart" | "touchMove" | "touchEnd",
    point?: { x: number; y: number },
  ) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: point ? [{ ...point, id: 1 }] : [],
    });
  await touch("touchStart", from);
  for (let step = 1; step <= 5; step += 1)
    await touch("touchMove", {
      x: from.x + ((to.x - from.x) * step) / 5,
      y: from.y + ((to.y - from.y) * step) / 5,
    });
  await touch("touchEnd");
  await cdp.detach();
}

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("panels open from the bottom tabs and the page never scrolls sideways", async ({
    page,
  }) => {
    await page.goto("./");
    await expectEmptyState(page);
    await upload(page, makeSolidPng(1200, 750, RED));
    // A new design starts on the Desktop size.
    await expectDesignSize(page, 1920, 1080);

    const style = page.getByRole("button", { name: "Style", exact: true });
    await style.click();
    await expect(style).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Size", exact: true }).click();
    await page.getByRole("radio", { name: /^Story/ }).click();
    await expectDesignSize(page, 1080, 1920);

    await page.getByRole("button", { name: "Close panel" }).click();
    await expect(style).toHaveAttribute("aria-pressed", "false");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await page.getByRole("button", { name: "Export", exact: true }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export PNG 2×" }).click(),
    ]);
    expect(readPngSize(await readFile(await download.path()))).toEqual({
      width: 2160,
      height: 3840,
    });
  });

  test("a swipe on a slider's track doesn't change it, but its thumb drags", async ({
    page,
    browserName,
  }) => {
    // Touch and safe-area emulation go through the Chrome DevTools Protocol.
    test.skip(browserName !== "chromium", "needs Chromium's DevTools Protocol");
    await page.goto("./");
    await upload(page, makeSolidPng(1200, 750, RED));
    await page.getByRole("button", { name: "Style", exact: true }).click();
    const slider = page.getByRole("slider", { name: "Border width" });
    await slider.scrollIntoViewIfNeeded();
    const value = await slider.getAttribute("aria-valuenow");
    const measure = async () => {
      const thumb = (await slider.boundingBox())!;
      const track = (await page
        .locator("[data-slot=slider]")
        .filter({ has: slider })
        .boundingBox())!;
      return { thumb, track, y: thumb.y + thumb.height / 2 };
    };

    // Starting well to the right of the thumb, on the track: the panel
    // scrolls instead.
    let { thumb, track, y } = await measure();
    const start = { x: track.x + track.width - 8, y };
    await swipe(page, start, { x: start.x - 40, y: y - 120 });
    await expect(slider).toHaveAttribute("aria-valuenow", value!);
    expect((await measure()).y).not.toBe(y);

    await slider.scrollIntoViewIfNeeded();
    ({ thumb, track, y } = await measure());
    await swipe(
      page,
      { x: thumb.x + thumb.width / 2, y },
      { x: track.x + track.width, y },
    );
    await expect(slider).not.toHaveAttribute("aria-valuenow", value!);
  });

  test("the editor stays clear of side notches in landscape", async ({
    page,
    browserName,
  }) => {
    // Touch and safe-area emulation go through the Chrome DevTools Protocol.
    test.skip(browserName !== "chromium", "needs Chromium's DevTools Protocol");
    await page.setViewportSize({ width: 844, height: 390 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { top: 0, bottom: 21, left: 47, right: 47 },
    });
    await page.goto("./");
    await expectEmptyState(page);
    const header = (await page.locator("header").boundingBox())!;
    expect(header.x).toBe(47);
    expect(header.x + header.width).toBe(844 - 47);
  });
});
