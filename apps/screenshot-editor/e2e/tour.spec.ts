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
const tool = (page: Page) => page.getByRole("combobox", { name: "Tool" });

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
  // The dropdown is shown switching to Style.
  await expect(tool(page)).toHaveValue("style");

  for (const title of ["Annotate", "Export", "Save your work"]) {
    await page.keyboard.press("ArrowRight");
    await expect(card(page)).toContainText(title);
  }
  await card(page).getByRole("button", { name: "Next" }).click();
  await expect(card(page)).toContainText("6 of 6");
  await card(page).getByRole("button", { name: "Done" }).click();

  await expect(card(page)).toBeHidden();
  await expectEmptyState(page);
  await expect(tool(page)).toHaveValue("background");
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

  await page.getByRole("button", { name: "More" }).click();
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

  await page.getByRole("button", { name: "More" }).click();
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
