import { expect, test } from "./helpers/fixtures";
import { expectEmptyState } from "./helpers/editor";

test("the site opens straight on the editor", async ({ page }) => {
  await page.goto("./");
  await expect(page).toHaveTitle("Screenshot Editor");
  await expectEmptyState(page);
  await expect(
    page.getByRole("button", { name: "Export PNG 2×" }),
  ).toBeDisabled();
});

test("the favicon and assets carry the base path", async ({
  page,
  baseURL,
}) => {
  await page.goto("./");
  const basePath = new URL(baseURL ?? "").pathname.replace(/\/$/, "");
  const icon = await page
    .locator('link[rel="icon"]')
    .first()
    .getAttribute("href");
  expect(icon?.startsWith(`${basePath}/`)).toBe(true);
  const scripts = await page
    .locator("script[src]")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("src") ?? ""),
    );
  expect(scripts.length).toBeGreaterThan(0);
  for (const src of scripts)
    expect(src.startsWith(`${basePath}/_next/`)).toBe(true);
});

test("pages answer HEAD requests, which Next's prefetcher sends", async ({
  request,
}) => {
  const response = await request.head("./");
  expect(response.status()).toBe(200);
});

test.describe("on a phone", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
  test("a notice suggests the desktop", async ({ page }) => {
    await page.goto("./");
    await expect(page.getByTestId("desktop-notice")).toHaveText(
      "Screenshot Editor is best viewed on desktop",
    );
  });
});

test("desktops get no phone notice", async ({ page }) => {
  await page.goto("./");
  await expect(
    page.getByTestId("canvas-stage").or(page.locator("main")),
  ).toBeVisible();
  await expect(page.getByTestId("desktop-notice")).toHaveCount(0);
});

test("link previews show the tour's illustration", async ({ page }) => {
  await page.goto("./");
  const image = page.locator('meta[property="og:image"]');
  await expect(image).toHaveAttribute(
    "content",
    /^https:\/\/.+\/opengraph-image\.png/,
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Screenshot Editor",
  );
  // The image itself is served next to the page, with the base path.
  const response = await page.request.get("opengraph-image.png");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
});
