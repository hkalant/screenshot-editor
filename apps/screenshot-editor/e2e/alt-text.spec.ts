import type { Page } from "@playwright/test";
import { expectEmptyState } from "./helpers/editor";
import { expect, test } from "./helpers/fixtures";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expectEmptyState(page);
});

const field = (page: Page) => page.getByRole("textbox", { name: "Alt text" });

test("the export options suggest alt text from the annotations", async ({
  page,
}) => {
  // Reading the screenshot's text loads the reader the first time.
  test.slow();
  await page
    .getByRole("button", { name: /sample/i })
    .first()
    .click();
  await page.getByRole("button", { name: "Export options" }).click();
  await expect(field(page)).toHaveValue("");
  await expect(
    page.getByText("Add steps, boxes or arrows for a suggestion"),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // A step on the screenshot: the suggestion names it, never "screenshot of".
  await page.getByRole("button", { name: "Add step 1" }).click();
  const box = await page.getByTestId("design-stage").boundingBox();
  if (!box) throw new Error("No stage");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByRole("button", { name: "Export options" }).click();
  await expect(page.getByText(/^Suggested from your annotations/)).toBeVisible({
    timeout: 60_000,
  });
  await expect(field(page)).toHaveValue(/^Step 1 /);
  await expect(field(page)).not.toHaveValue(/screenshot/i);

  // Written over, it stays the user's until they go back to the suggestion.
  await field(page).fill("The course menu, with Assessment selected.");
  await expect(page.getByText("Your own wording.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Export options" }).click();
  await expect(field(page)).toHaveValue(
    "The course menu, with Assessment selected.",
  );
  await page.getByRole("button", { name: "Back to the suggestion" }).click();
  await expect(field(page)).toHaveValue(/^Step 1 /);
  await expect(
    page.getByRole("button", { name: "Copy alt text" }),
  ).toBeEnabled();
});
