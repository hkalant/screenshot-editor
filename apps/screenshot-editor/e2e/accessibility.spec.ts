import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expectEmptyState, openTab, stage } from "./helpers/editor";
import { expect, test } from "./helpers/fixtures";

// Automated WCAG 2.2 A/AA checks of the main screens. They catch only part
// of WCAG; keyboard use and screen readers still need checking by hand.

const WCAG_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];

async function expectNoViolations(page: Page) {
  // Text fading in reads as low contrast, so wait for it to settle.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== "running"),
  );
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .analyze();
  const summary = violations.map(
    ({ id, help, nodes }) =>
      `${id}: ${help}\n  ${nodes.map((node) => node.target.join(" ")).join("\n  ")}`,
  );
  expect(summary).toEqual([]);
}

async function loadSample(page: Page) {
  await page.getByRole("button", { name: "Try a sample image" }).click();
  await expect(stage(page)).toBeVisible();
}

test.describe("welcome tour", () => {
  test.use({ tourSeen: false });

  test("has no detectable WCAG violations", async ({ page }) => {
    await page.goto("./");
    await expect(page.getByTestId("tour-welcome")).toBeVisible();
    await expectNoViolations(page);
  });
});

test("the empty editor has no detectable WCAG violations", async ({ page }) => {
  await page.goto("./");
  await expectEmptyState(page);
  await expectNoViolations(page);
});

test("the editor with a screenshot has no detectable WCAG violations", async ({
  page,
}) => {
  await page.goto("./");
  await loadSample(page);
  await expectNoViolations(page);
  await openTab(page, "Style");
  await expectNoViolations(page);
});

test("the open menus have no detectable WCAG violations", async ({ page }) => {
  await page.goto("./");
  await loadSample(page);
  for (const name of [/^Canvas size/, /^More$/, /^Export options$/]) {
    await page.getByRole("button", { name }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoViolations(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("has no detectable WCAG violations", async ({ page }) => {
    await page.goto("./");
    await expectEmptyState(page);
    await expectNoViolations(page);
    await loadSample(page);
    await expectNoViolations(page);
  });
});

test("keyboard focus is visible on the toolbar's buttons", async ({ page }) => {
  await page.goto("./");
  await loadSample(page);
  const step = page.getByRole("button", { name: "Add step 1" });
  await step.focus();
  // Focus that came from the keyboard, as :focus-visible needs.
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(step).toBeFocused();
  await expect(step).toHaveCSS("outline-style", "solid");
  await expect(step).toHaveCSS("outline-width", "3px");
});
