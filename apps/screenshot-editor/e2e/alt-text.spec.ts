import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import {
  chooseFrame,
  confirmFileName,
  expectEmptyState,
  openStyleSections,
  RED,
  stage,
  upload,
} from "./helpers/editor";
import { expect, test } from "./helpers/fixtures";
import { makeSolidPng } from "./helpers/png";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expectEmptyState(page);
});

const field = (page: Page) => page.getByRole("textbox", { name: "Alt text" });

const openOptions = (page: Page) =>
  page.getByRole("button", { name: "Export options" }).click();

/** The autosaved design's alt text, read straight from IndexedDB. */
function savedAltText(page: Page) {
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
          request.onsuccess = () =>
            resolve(request.result?.design?.altText ?? null);
          request.onerror = () => resolve(null);
        };
      }),
  );
}

/** Adds the next step in the middle of the screenshot, or `across` of the way over. */
async function addStep(page: Page, number: number, across = 0.5) {
  const tool = page.getByRole("button", { name: `Add step ${number}` });
  // The step tool stays on after a step; a second click would turn it off.
  if ((await tool.getAttribute("aria-pressed")) !== "true") await tool.click();
  const box = await stage(page).boundingBox();
  if (!box) throw new Error("No stage");
  await page.mouse.click(box.x + box.width * across, box.y + box.height / 2);
}

test("the export options suggest alt text from the annotations", async ({
  page,
}) => {
  // Reading the screenshot's text loads the reader the first time.
  test.slow();
  await page
    .getByRole("button", { name: /sample/i })
    .first()
    .click();

  // Nothing marked yet: the page's title says what it shows.
  await openOptions(page);
  await expect(
    page.getByText(/^Suggested from the screenshot’s text/),
  ).toBeVisible({ timeout: 60_000 });
  await expect(field(page)).toHaveValue(/^A screen titled ‘ANML7006/);
  await page.keyboard.press("Escape");

  // A step on the screenshot: the suggestion names it, never "screenshot of".
  await addStep(page, 1);
  await openOptions(page);
  await expect(page.getByText(/^Suggested from your annotations/)).toBeVisible({
    timeout: 60_000,
  });
  await expect(field(page)).toHaveValue(
    /^A screen titled ‘ANML7006.*’\. Step 1 /,
  );
  await expect(field(page)).not.toHaveValue(/screenshot/i);

  // Written over, it stays the user's until they go back to the suggestion.
  await field(page).fill("The course menu, with Assessment selected.");
  await expect(
    page.getByText(
      "Your own wording. Always follow digital accessibility guidelines for alt text.",
    ),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await openOptions(page);
  await expect(field(page)).toHaveValue(
    "The course menu, with Assessment selected.",
  );
  await page.getByRole("button", { name: "Back to the suggestion" }).click();
  await expect(field(page)).toHaveValue(
    /^A screen titled ‘ANML7006.*’\. Step 1 /,
  );
  await expect(
    page.getByRole("button", { name: "Copy alt text" }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");

  // A device frame is part of the meaning: it opens the suggestion.
  await openStyleSections(page);
  await page
    .getByRole("radiogroup", { name: "Frame", exact: true })
    .getByRole("radio", { name: "Laptop", exact: true })
    .click();
  await openOptions(page);
  await expect(field(page)).toHaveValue(
    /^On a laptop: a screen titled ‘ANML7006.*’\. Step 1 /,
  );
});

test("the suggestion names the page and says what people should notice", async ({
  page,
}) => {
  test.slow();
  await upload(page, makeSolidPng(1200, 750, RED), "Plain.png");
  await chooseFrame(page, "macOS browser");
  await page
    .getByRole("textbox", { name: "Address", exact: true })
    .fill("https://www.moodle.ac.uk/course/view.php?id=4");
  await addStep(page, 1, 0.3);

  await openOptions(page);
  await expect(field(page)).toHaveValue(
    /^A page at moodle\.ac\.uk\. Step 1 is /,
  );
  const purpose = page.getByRole("textbox", {
    name: "What should people notice? (optional)",
  });
  await purpose.fill("where to start the quiz");
  await expect(field(page)).toHaveValue(
    /^A page at moodle\.ac\.uk\. Where to start the quiz\. Step 1 is /,
  );

  // Kept with the design, and set aside while the user writes their own.
  await page.keyboard.press("Escape");
  await openOptions(page);
  await expect(purpose).toHaveValue("where to start the quiz");
  await field(page).fill("The quiz link.");
  await expect(purpose).toHaveCount(0);
  await page.getByRole("button", { name: "Back to the suggestion" }).click();
  await expect(purpose).toHaveValue("where to start the quiz");
});

test("written alt text says when the annotations have changed since", async ({
  page,
}) => {
  test.slow();
  await upload(page, makeSolidPng(1200, 750, RED), "Plain.png");
  await addStep(page, 1, 0.3);
  await openOptions(page);
  await field(page).fill("Where to start.");
  await expect(page.getByText(/^Your own wording\./)).toBeVisible();
  await page.keyboard.press("Escape");

  // Another step: the wording may no longer fit.
  await addStep(page, 2, 0.7);
  await openOptions(page);
  await expect(field(page)).toHaveValue("Where to start.");
  await expect(
    page.getByText(
      /^The annotations or frame have changed since you wrote this\./,
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep mine" }).click();
  await expect(page.getByText(/^Your own wording\./)).toBeVisible();
  await expect(field(page)).toHaveValue("Where to start.");
  await page.keyboard.press("Escape");

  // And again, this time taking the new suggestion.
  await addStep(page, 3, 0.5);
  await openOptions(page);
  await page.getByRole("button", { name: "Use the new suggestion" }).click();
  await expect(field(page)).toHaveValue(/^Step 1 .* Step 2 .* Step 3 /);
  await expect(
    page.getByRole("button", { name: "Back to the suggestion" }),
  ).toHaveCount(0);
});

test("written alt text is saved with the design and in project files", async ({
  page,
}) => {
  await upload(page, makeSolidPng(1200, 750, RED), "Plain.png");
  await openOptions(page);
  await field(page).fill("A red test card.");
  await page.keyboard.press("Escape");

  // Autosaved: still there after a reload.
  await expect
    .poll(() => savedAltText(page))
    .toMatchObject({ text: "A red test card." });
  await page.reload();
  await expect(stage(page)).toBeVisible();
  await openOptions(page);
  await expect(field(page)).toHaveValue("A red test card.");
  await expect(page.getByText(/^Your own wording\./)).toBeVisible();
  await page.keyboard.press("Escape");

  // And in the project file.
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /^Save project/ }).click();
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    confirmFileName(page),
  ]);
  const project = JSON.parse(await readFile(await file.path(), "utf8"));
  expect(project.design.altText).toMatchObject({ text: "A red test card." });
});

test.describe("when the text reader can't load", () => {
  test.use({
    allowedConsoleErrors: [/ocr|worker|Failed to load|ERR_FAILED|network/i],
  });

  test("it says so and can try again", async ({ page }) => {
    test.slow();
    await page.route("**/ocr/*.traineddata.gz", (route) => route.abort());
    await upload(page, makeSolidPng(1200, 750, RED), "Plain.png");
    await openOptions(page);
    await expect(
      page.getByText(/^The screenshot’s text couldn’t be read\./),
    ).toBeVisible({ timeout: 30_000 });

    await page.unroute("**/ocr/*.traineddata.gz");
    await page.getByRole("button", { name: "Read the text again" }).click();
    // A plain red card has no text, so nothing to suggest, but no failure.
    await expect(
      page.getByText(/^Add steps, boxes or arrows for a suggestion/),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByRole("button", { name: "Read the text again" }),
    ).toHaveCount(0);
  });
});
