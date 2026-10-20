import type { Page } from "@playwright/test";
import {
  expectEmptyState,
  RED,
  stage,
  upload,
  useAutoSize,
} from "./helpers/editor";
import { expect, test } from "./helpers/fixtures";
import { makeSolidPng } from "./helpers/png";

test.use({ tourSeen: false });

const welcome = (page: Page) => page.getByTestId("tour-welcome");
const card = (page: Page) => page.getByTestId("tour-step");
const frameSection = (page: Page) =>
  page
    .getByRole("complementary", { name: "Settings" })
    .getByRole("button", { name: "Frame", exact: true });

test("shows the welcome once, and Skip leaves the editor empty", async ({
  page,
}) => {
  await page.goto("./");
  await expect(welcome(page)).toBeVisible();
  await expect(
    welcome(page).getByRole("heading", {
      name: "Welcome to Screenshot Editor",
    }),
  ).toBeVisible();
  await welcome(page).getByRole("button", { name: "Skip tour" }).click();
  await expect(welcome(page)).toBeHidden();
  await expectEmptyState(page);

  await page.reload();
  await expectEmptyState(page);
  await expect(welcome(page)).toBeHidden();
});

test("walks through the steps on a sample, then removes it", async ({
  page,
}) => {
  await page.goto("./");
  await welcome(page).getByRole("button", { name: "Start" }).click();
  await expect(card(page)).toContainText("Background");
  await expect(stage(page)).toBeVisible();

  await card(page).getByRole("button", { name: "Next" }).click();
  await expect(card(page)).toContainText("Frame & Style");
  // The Frame section is shown opening.
  await expect(frameSection(page)).toHaveAttribute("aria-expanded", "true");

  for (const title of ["Annotate", "Export", "Save your work"]) {
    await page.keyboard.press("ArrowRight");
    await expect(card(page)).toContainText(title);
  }
  await card(page).getByRole("button", { name: "Next" }).click();
  await expect(card(page)).toContainText("6 of 6");
  await card(page).getByRole("button", { name: "Done" }).click();

  await expect(card(page)).toBeHidden();
  await expectEmptyState(page);
  // Nothing to undo: the sample left no trace in the history.
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }).first(),
  ).toBeDisabled();
});

test("Esc from the More menu's tour puts the user's screenshot back", async ({
  page,
}) => {
  await page.goto("./");
  await welcome(page).getByRole("button", { name: "Skip tour" }).click();
  await upload(page, makeSolidPng(400, 300, RED), "mine.png");
  await expect(stage(page)).toBeVisible();

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Take the tour" }).click();
  await welcome(page).getByRole("button", { name: "Start" }).click();
  await expect(card(page)).toContainText("Background");
  await page.keyboard.press("Escape");
  await expect(card(page)).toBeHidden();

  // The user's screenshot is back, and undo still reaches before it.
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  await expectEmptyState(page);
});

test("closing the page mid-tour reopens on the user's own design", async ({
  page,
}) => {
  await page.goto("./");
  await welcome(page).getByRole("button", { name: "Skip tour" }).click();
  await useAutoSize(page);
  await upload(page, makeSolidPng(400, 300, RED), "mine.png");
  await expect(stage(page)).toBeVisible();
  const mine = await stage(page).getAttribute("data-width");

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Take the tour" }).click();
  await welcome(page).getByRole("button", { name: "Start" }).click();
  await expect(card(page)).toContainText("Background");
  await expect(stage(page)).not.toHaveAttribute("data-width", mine ?? "");
  // Long enough for an autosave to have run, were it not held off.
  await page.waitForTimeout(1500);

  await page.reload();
  await expect(stage(page)).toBeVisible();
  await expect(card(page)).toBeHidden();
  await expect(stage(page)).toHaveAttribute("data-width", mine ?? "");
});

test("narrowing the window for a moment doesn't lose the welcome", async ({
  page,
}) => {
  await page.goto("./");
  await expect(welcome(page)).toBeVisible();
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: 700, height: size.height });
  await expect(welcome(page)).toBeHidden();
  // Keys reach the editor while it's hidden. Waits for the key to arrive:
  // WebKit can deliver it after the next resize, when the welcome is back
  // and would rightly close on it.
  await page.evaluate(() =>
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") document.body.dataset.escaped = "";
      },
      { capture: true },
    ),
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("body")).toHaveAttribute("data-escaped");
  await page.setViewportSize(size);
  await expect(welcome(page)).toBeVisible();
});
