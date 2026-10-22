import type { Page } from "@playwright/test";
import {
  chooseCanvasSize,
  expectColor,
  expectEmptyState,
  exportImage,
  RED,
  stage,
  upload,
  useAutoSize,
} from "./helpers/editor";
import { expect, test } from "./helpers/fixtures";
import {
  isRed,
  makeSolidPng,
  makeStripedPng,
  samplePixels,
} from "./helpers/png";

// A 400 x 300 screenshot on an auto canvas with 72 px padding: the canvas is
// 544 x 444 and the screenshot starts at (72, 72).
const PADDING = 72;
const IMAGE = { width: 400, height: 300 };

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expectEmptyState(page);
  await useAutoSize(page);
});

const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Annotate" });
const tool = (page: Page, name: string | RegExp) =>
  toolbar(page).getByRole("button", { name, exact: typeof name === "string" });

/** Picks a tool from the menu of a toolbar button that groups tools. */
async function pickFromMenu(
  page: Page,
  button: string,
  menu: string,
  name: string,
) {
  await tool(page, button).click();
  await page
    .getByRole("menu", { name: menu })
    .getByRole("menuitemradio", { name, exact: true })
    .click();
}

const pickShape = (page: Page, name: string) =>
  pickFromMenu(page, "Choose shape", "Shapes", name);

const pickArrowTool = (page: Page, name: "Arrow" | "Line") =>
  pickFromMenu(page, "Choose arrow or line", "Arrows and lines", name);

/** Screen coordinates of a point given as fractions of the screenshot. */
async function onImage(page: Page, fx: number, fy: number) {
  const box = await stage(page).boundingBox();
  if (!box) throw new Error("No stage");
  const scale = box.width / (IMAGE.width + 2 * PADDING);
  return {
    x: box.x + (PADDING + fx * IMAGE.width) * scale,
    y: box.y + (PADDING + fy * IMAGE.height) * scale,
  };
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const start = await onImage(page, ...from);
  const end = await onImage(page, ...to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
}

/** Waits until the canvas has redrawn, so what was just drawn can be pressed. */
const nextFrame = (page: Page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );

/** Export pixels at points given as fractions of the screenshot (2x export). */
async function pixelsOnImage(page: Page, points: [number, number][]) {
  return samplePixels(
    page,
    (await exportImage(page)).data,
    points.map(([fx, fy]) => [
      (PADDING + fx * IMAGE.width) * 2,
      (PADDING + fy * IMAGE.height) * 2,
    ]),
  );
}

test("the toolbar appears with a screenshot and offers three colours", async ({
  page,
}) => {
  await expect(toolbar(page)).toHaveCount(0);
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await expect(toolbar(page)).toBeVisible();
  await expect(
    toolbar(page)
      .getByRole("radiogroup", { name: "Annotation colour" })
      .getByRole("radio"),
  ).toHaveCount(3);
  for (const name of ["Charcoal", "Pink", "Yellow"])
    await expect(toolbar(page).getByRole("radio", { name })).toBeVisible();
});

test("steps count up, take only numbers and can start again from 1", async ({
  page,
}) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await tool(page, "Add step 1").click();
  for (const [fx, fy] of [
    [0.2, 0.3],
    [0.5, 0.3],
  ] as const) {
    const point = await onImage(page, fx, fy);
    await page.mouse.click(point.x, point.y);
  }
  await expect(tool(page, "Add step 3")).toBeVisible();

  // A step is drawn in its colour, with a soft shadow, on the export.
  await toolbar(page).getByRole("radio", { name: "Charcoal" }).click();
  const third = await onImage(page, 0.8, 0.7);
  await page.mouse.click(third.x, third.y);
  // Left of the number, inside the circle.
  const [charcoal] = await pixelsOnImage(page, [[0.8 - 5 / IMAGE.width, 0.7]]);
  expectColor(charcoal, "#424a52", 20);

  await tool(page, "Reset step count").click();
  await expect(tool(page, "Add step 1")).toBeVisible();
  await expect(tool(page, "Reset step count")).toBeDisabled();

  // Select the first step and change its number: letters are dropped.
  await tool(page, "Select and move").click();
  const first = await onImage(page, 0.2, 0.3);
  await page.mouse.click(first.x, first.y);
  const field = toolbar(page).getByLabel("Step number");
  await expect(field).toHaveValue("1");
  await field.fill("");
  await field.pressSequentially("a7b");
  await expect(field).toHaveValue("7");
  await field.press("Enter");

  // Delete removes the selected step.
  await tool(page, "Delete annotation").click();
  await expect(field).toHaveCount(0);
});

test("shapes are drawn filled or as an outline in the chosen colour", async ({
  page,
}) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));

  await pickShape(page, "Rectangle");
  await tool(page, "Filled shape").click();
  await toolbar(page).getByRole("radio", { name: "Pink" }).click();
  await drag(page, [0.1, 0.1], [0.4, 0.4]);

  await pickShape(page, "Rounded rectangle");
  await tool(page, "Outline shape").click();
  await toolbar(page).getByRole("radio", { name: "Yellow" }).click();
  await drag(page, [0.55, 0.1], [0.9, 0.4]);

  await pickShape(page, "Circle");
  await tool(page, "Filled shape").click();
  await toolbar(page).getByRole("radio", { name: "Charcoal" }).click();
  await drag(page, [0.2, 0.6], [0.35, 0.8]);

  const [filled, outlineInside, outlineEdge, circle, plain] =
    await pixelsOnImage(page, [
      [0.25, 0.25],
      [0.725, 0.25],
      [0.725, 0.1],
      // The circle's box is square: 60 x 60 px from (80, 180).
      [(80 + 30) / IMAGE.width, (180 + 30) / IMAGE.height],
      [0.5, 0.9],
    ]);
  expectColor(filled, "#d10373", 6);
  // An outline shape is transparent inside.
  expect(isRed(outlineInside)).toBe(true);
  expectColor(outlineEdge, "#f9c909", 20);
  expectColor(circle, "#424a52", 6);
  expect(isRed(plain)).toBe(true);
});

test("Escape puts the tool down and undo removes an annotation", async ({
  page,
}) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await pickShape(page, "Rectangle");
  await tool(page, "Filled shape").click();
  await drag(page, [0.3, 0.3], [0.7, 0.7]);
  const [drawn] = await pixelsOnImage(page, [[0.5, 0.5]]);
  expect(isRed(drawn)).toBe(false);

  await page.keyboard.press("Escape");
  await expect(tool(page, "Select and move")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  const [undone] = await pixelsOnImage(page, [[0.5, 0.5]]);
  expect(isRed(undone)).toBe(true);
});

test("annotations move with any tool on, and pressing one never adds another", async ({
  page,
}) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await tool(page, "Add step 1").click();
  const point = await onImage(page, 0.2, 0.3);
  await page.mouse.click(point.x, point.y);
  await nextFrame(page);
  // Still the step tool: the step is picked up and moved, not stacked on.
  await drag(page, [0.2, 0.3], [0.6, 0.6]);
  await expect(tool(page, "Add step 2")).toBeVisible();
  await expect(tool(page, "Add step 2")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await pickShape(page, "Rectangle");
  await tool(page, "Filled shape").click();
  await toolbar(page).getByRole("radio", { name: "Charcoal" }).click();
  await drag(page, [0.1, 0.6], [0.3, 0.9]);
  await nextFrame(page);
  // Still the rectangle tool: dragging the rectangle moves it.
  await drag(page, [0.2, 0.75], [0.75, 0.25]);

  const [moved, oldStep, rectangle, oldRectangle, between] =
    await pixelsOnImage(page, [
      [0.6 - 5 / IMAGE.width, 0.6],
      [0.2 - 5 / IMAGE.width, 0.3],
      [0.75, 0.25],
      [0.2, 0.75],
      [0.45, 0.5],
    ]);
  expectColor(moved, "#d10373", 20);
  expect(isRed(oldStep)).toBe(true);
  expectColor(rectangle, "#424a52", 6);
  expect(isRed(oldRectangle)).toBe(true);
  // No second rectangle drawn along the drag.
  expect(isRed(between)).toBe(true);
});

test("a step goes inside an outline shape, which moves by its border", async ({
  page,
}) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await pickShape(page, "Rectangle");
  await tool(page, "Outline shape").click();
  await toolbar(page).getByRole("radio", { name: "Yellow" }).click();
  await drag(page, [0.2, 0.2], [0.8, 0.8]);

  await tool(page, "Add step 1").click();
  await toolbar(page).getByRole("radio", { name: "Pink" }).click();
  const centre = await onImage(page, 0.5, 0.5);
  await page.mouse.click(centre.x, centre.y);
  await nextFrame(page);
  await expect(tool(page, "Add step 2")).toBeVisible();

  // Picked up by its left edge, with the step tool still on.
  await drag(page, [0.2, 0.5], [0.1, 0.5]);
  await expect(tool(page, "Add step 2")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Delete rectangle" }),
  ).toBeVisible();

  const [step, newEdge, oldEdge] = await pixelsOnImage(page, [
    [0.5 - 5 / IMAGE.width, 0.5],
    [0.1, 0.5],
    [0.2, 0.5],
  ]);
  expectColor(step, "#d10373", 20);
  expectColor(newEdge, "#f9c909", 40);
  expect(isRed(oldEdge)).toBe(true);
});

test("the button by a selected annotation deletes it, as does Delete", async ({
  page,
}) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await tool(page, "Add step 1").click();
  const point = await onImage(page, 0.3, 0.4);
  await page.mouse.click(point.x, point.y);
  await expect(page.getByRole("button", { name: "Delete step 1" })).toHaveCount(
    0,
  );
  // Pressing the step (step tool still on) selects it, once it's drawn.
  await expect(tool(page, "Add step 2")).toBeVisible();
  await nextFrame(page);
  await page.mouse.click(point.x, point.y);
  await page.getByRole("button", { name: "Delete step 1" }).click();
  await expect(page.getByRole("button", { name: "Delete step 1" })).toHaveCount(
    0,
  );

  await pickShape(page, "Circle");
  await tool(page, "Filled shape").click();
  await drag(page, [0.6, 0.5], [0.75, 0.7]);
  await nextFrame(page);
  const circle = await onImage(page, 0.675, 0.6);
  await page.mouse.click(circle.x, circle.y);
  await expect(
    page.getByRole("button", { name: "Delete circle" }),
  ).toBeVisible();
  await page.keyboard.press("Delete");
  await expect(page.getByRole("button", { name: "Delete circle" })).toHaveCount(
    0,
  );

  const [step, shape] = await pixelsOnImage(page, [
    [0.3 - 5 / IMAGE.width, 0.4],
    [0.675, 0.6],
  ]);
  expect(isRed(step)).toBe(true);
  expect(isRed(shape)).toBe(true);
  // The screenshot itself stays.
  await expect(toolbar(page)).toBeVisible();
});

test("an outline keeps its border width when zoomed out and resized", async ({
  page,
}) => {
  const big = { width: 1600, height: 1000 };
  await upload(page, makeSolidPng(big.width, big.height, RED));
  const zoomOut = page.getByRole("button", { name: "Zoom out" });
  while (
    (await stage(page).evaluate(
      (element) =>
        element.getBoundingClientRect().width /
        Number(element.getAttribute("data-width")),
    )) > 0.35
  )
    await zoomOut.click();
  const box = await stage(page).boundingBox();
  if (!box) throw new Error("No stage");
  const scale = box.width / (big.width + 2 * PADDING);
  const at = (fx: number, fy: number) => ({
    x: box.x + (PADDING + fx * big.width) * scale,
    y: box.y + (PADDING + fy * big.height) * scale,
  });

  await pickShape(page, "Rectangle");
  await tool(page, "Outline shape").click();
  await toolbar(page).getByRole("radio", { name: "Yellow" }).click();
  let from = at(0.25, 0.25);
  let to = at(0.5, 0.5);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();

  await nextFrame(page);
  // Select it by its border and pull its bottom-right corner out, once the
  // handles are drawn.
  const border = at(0.25, 0.375);
  await page.mouse.click(border.x, border.y);
  await expect(
    page.getByRole("button", { name: "Delete rectangle" }),
  ).toBeVisible();
  await nextFrame(page);
  from = at(0.5, 0.5);
  to = at(0.75, 0.75);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press("Escape");

  // Yellow pixels across the left border, in the preview: as wide as the
  // border at this zoom (0.004 of the image width), not wider.
  const countYellow = () =>
    stage(page).evaluate(
      (element, { x, y }) => {
        const canvas = element.querySelector("canvas");
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return 0;
        const ratio = canvas.width / element.getBoundingClientRect().width;
        const data = context.getImageData(
          Math.round((x - 12) * ratio),
          Math.round(y * ratio),
          Math.round(24 * ratio),
          1,
        ).data;
        let count = 0;
        for (let index = 0; index < data.length; index += 4)
          if (data[index + 1] > 100) count += 1;
        // In screen pixels.
        return count / ratio;
      },
      {
        x: (PADDING + 0.25 * big.width) * scale,
        y: (PADDING + 0.6 * big.height) * scale,
      },
    );
  const width = 0.004 * big.width * scale;
  // Once the canvas has redrawn the resized rectangle.
  await expect.poll(countYellow).toBeGreaterThanOrEqual(1);
  const yellow = await countYellow();
  expect(yellow).toBeLessThanOrEqual(Math.ceil(width) + 1);

  // The export has the resized rectangle with its edge near 0.75 (the
  // frame insets the screenshot a little), and none at the old edge.
  const exported = (await exportImage(page)).data;
  const near = (fx: number, fy: number) =>
    Array.from({ length: 21 }, (_, index): [number, number] => [
      (PADDING + fx * big.width) * 2 - 30 + index * 3,
      (PADDING + fy * big.height) * 2,
    ]);
  const isYellow = ([r, g, b]: number[]) => r > 200 && g > 150 && b < 80;
  const edge = await samplePixels(page, exported, near(0.75, 0.6));
  const oldEdge = await samplePixels(page, exported, near(0.5, 0.4));
  expect(edge.some(isYellow)).toBe(true);
  expect(oldEdge.some(isYellow)).toBe(false);
});

test("steps and shapes can go on the background, off the screenshot", async ({
  page,
}) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await tool(page, "Add step 1").click();
  // In the padding left of the screenshot.
  const point = await onImage(page, -0.1, 0.5);
  await page.mouse.click(point.x, point.y);
  await expect(tool(page, "Add step 2")).toBeVisible();

  await pickShape(page, "Rectangle");
  await tool(page, "Filled shape").click();
  // From the background below the screenshot onto it.
  await drag(page, [0.3, 1.15], [0.6, 0.8]);

  const [step, below, onShot] = await pixelsOnImage(page, [
    [-0.1 - 5 / IMAGE.width, 0.5],
    [0.45, 1.1],
    [0.45, 0.9],
  ]);
  expectColor(step, "#d10373", 20);
  expectColor(below, "#d10373", 6);
  expectColor(onShot, "#d10373", 6);
});

test("the handle moves the screenshot whatever tool is on", async ({
  page,
}) => {
  await chooseCanvasSize(page, /^Desktop/);
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await tool(page, "Add step 1").click();
  const canvas = { height: 1080 };
  // Right of the canvas centre, on the screenshot until it moves left.
  const centre = async () => {
    const [pixel] = await samplePixels(page, (await exportImage(page)).data, [
      [1400 * 2, canvas.height],
    ]);
    return pixel;
  };
  expect(isRed(await centre())).toBe(true);

  // With a mouse it shows only while the pointer is over the screenshot.
  const handle = page.getByRole("button", { name: "Move screenshot" });
  const box = await stage(page).boundingBox();
  if (!box) throw new Error("No stage");
  await page.mouse.move(box.x + 4, box.y + 4);
  await expect(handle).toBeHidden();
  const onShot = await onImage(page, 0.5, 0.5);
  await page.mouse.move(onShot.x, onShot.y);
  await expect(handle).toBeVisible();
  const from = await handle.boundingBox();
  if (!from) throw new Error("No handle");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    from.x + from.width / 2 - box.width * 0.3,
    from.y + from.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();

  // Moved left, and no step added along the way.
  expect(isRed(await centre())).toBe(false);
  await page.mouse.move(box.x + 4, box.y + 4);
  await expect(handle).toBeHidden();
  await expect(tool(page, "Add step 1")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // One undo puts it back.
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  expect(isRed(await centre())).toBe(true);
});

test("the screenshot resizes from its corners, up to half as big again", async ({
  page,
}) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  const corner = page.getByRole("button", {
    name: "Resize screenshot from the bottom right corner",
  });
  // With Auto, the canvas is the screenshot's size: nothing to resize.
  await expect(corner).toHaveCount(0);

  await chooseCanvasSize(page, /^Desktop/);
  // 1920 x 1080 with 72 px padding: the 400 x 300 shot fits at 1248 x 936,
  // from (336, 72) to (1584, 1008).
  const box = await stage(page).boundingBox();
  if (!box) throw new Error("No stage");
  const zoom = box.width / 1920;
  const at = (x: number, y: number) => ({
    x: box.x + x * zoom,
    y: box.y + y * zoom,
  });
  const isRedAt = async (x: number, y: number) => {
    const [pixel] = await samplePixels(page, (await exportImage(page)).data, [
      [x * 2, y * 2],
    ]);
    return isRed(pixel);
  };
  const middle = at(960, 540);
  const drag = async (to: { x: number; y: number }) => {
    // Exporting moved the pointer away: back over the screenshot first.
    await page.mouse.move(middle.x, middle.y);
    await expect(corner).toBeVisible();
    const from = await corner.boundingBox();
    if (!from) throw new Error("No corner");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
  };

  // Hidden until the pointer is over the screenshot.
  await page.mouse.move(box.x + 4, box.y + 4);
  await expect(corner).toBeHidden();
  await page.mouse.move(middle.x, middle.y);
  await expect(corner).toBeVisible();

  // Resting on a corner says what it does.
  const tip = page.getByTestId("resize-tooltip");
  const handle = await corner.boundingBox();
  if (!handle) throw new Error("No corner");
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await expect(tip).toHaveText(
    "Drag to resize. Double-click to return to the original size.",
  );
  await expect(corner).toHaveAccessibleDescription(
    "Drag to resize. Double-click to return to the original size.",
  );
  await page.mouse.move(middle.x, middle.y);
  await expect(tip).toHaveCount(0);

  // Half size, with the top-left corner where it was.
  await drag(middle);
  expect(await isRedAt(400, 100)).toBe(true);
  expect(await isRedAt(1400, 900)).toBe(false);

  // Bigger than fits: past the padding, cropped by the canvas edge.
  await drag(at(1900, 1070));
  expect(await isRedAt(1400, 900)).toBe(true);
  expect(await isRedAt(1700, 540)).toBe(true);

  // Each resize is one undo step.
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  expect(await isRedAt(1400, 900)).toBe(false);

  // A double-click fits it again.
  await page.mouse.move(middle.x, middle.y);
  await corner.dblclick();
  expect(await isRedAt(1400, 900)).toBe(true);
});

test("a step can be resized from a corner, and the next step matches", async ({
  page,
}) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await tool(page, "Add step 1").click();
  const point = await onImage(page, 0.3, 0.4);
  await page.mouse.click(point.x, point.y);
  // Added and drawn, so the next press picks it up rather than adding step 2.
  await expect(tool(page, "Add step 2")).toBeVisible();
  await nextFrame(page);
  await page.mouse.click(point.x, point.y);
  await expect(
    page.getByRole("button", { name: "Delete step 1" }),
  ).toBeVisible();
  await nextFrame(page);

  // Pull the bottom-right handle out: the radius is 0.019 image widths, and
  // the handle sits just outside the circle.
  const corner = await onImage(
    page,
    0.3 + 0.019 + 3 / IMAGE.width,
    0.4 + (0.019 * IMAGE.width + 3) / IMAGE.height,
  );
  const out = await onImage(
    page,
    0.3 + 0.06,
    0.4 + (0.06 * IMAGE.width) / IMAGE.height,
  );
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(out.x, out.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press("Escape");

  // Well beyond the old radius (7.6 px on this screenshot), still the step.
  const second = await onImage(page, 0.7, 0.5);
  await page.mouse.click(second.x, second.y);
  const [grown, next] = await pixelsOnImage(page, [
    [0.3, 0.4 + 14 / IMAGE.height],
    [0.7, 0.5 + 14 / IMAGE.height],
  ]);
  expectColor(grown, "#d10373", 20);
  expectColor(next, "#d10373", 20);
});

test("an arrow is drawn by dragging, its ends move, and it can be deleted", async ({
  page,
}) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await pickArrowTool(page, "Arrow");
  await toolbar(page).getByRole("radio", { name: "Charcoal" }).click();
  // From (80, 60) to (240, 180) on the screenshot: 200 px along (0.8, 0.6).
  await drag(page, [0.2, 0.2], [0.6, 0.6]);

  const [line, head, beyond] = await pixelsOnImage(page, [
    [0.4, 0.4],
    // 5 px back from the tip, inside the head.
    [0.59, 0.59],
    // 8 px past the tip.
    [0.616, 0.616],
  ]);
  expectColor(line, "#424a52", 20);
  expectColor(head, "#424a52", 20);
  expect(isRed(beyond)).toBe(true);

  // Pressing the arrow (arrow tool still on) selects it; then pull its tip
  // up to the right.
  await nextFrame(page);
  const middle = await onImage(page, 0.4, 0.4);
  await page.mouse.click(middle.x, middle.y);
  await expect(
    page.getByRole("button", { name: "Delete arrow" }),
  ).toBeVisible();
  await nextFrame(page);
  await drag(page, [0.6, 0.6], [0.8, 0.3]);

  // Now from (80, 60) to (320, 90).
  const [moved, old] = await pixelsOnImage(page, [
    [0.5, 0.25],
    [0.4, 0.4],
  ]);
  expectColor(moved, "#424a52", 20);
  expect(isRed(old)).toBe(true);
  // Still selected, and still one arrow.
  await expect(
    page.getByRole("button", { name: "Delete arrow" }),
  ).toBeVisible();

  // Exporting moved the focus to the toolbar: press the arrow again first.
  const now = await onImage(page, 0.5, 0.25);
  await page.mouse.click(now.x, now.y);
  await page.keyboard.press("Delete");
  await expect(page.getByRole("button", { name: "Delete arrow" })).toHaveCount(
    0,
  );
  const [gone] = await pixelsOnImage(page, [[0.5, 0.25]]);
  expect(isRed(gone)).toBe(true);
});

test("an arrow's style is picked from the menu below it, and its middle bends it", async ({
  page,
}) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await pickArrowTool(page, "Arrow");
  await toolbar(page).getByRole("radio", { name: "Charcoal" }).click();
  await drag(page, [0.2, 0.5], [0.8, 0.5]);
  await nextFrame(page);

  // Hovering the arrow shows its styles, solid first.
  const menu = page.getByRole("radiogroup", { name: "Arrow style" });
  await expect(menu).toHaveCount(0);
  const middle = await onImage(page, 0.5, 0.5);
  await page.mouse.move(middle.x, middle.y);
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("radio", { name: "Solid arrow" }),
  ).toHaveAttribute("aria-checked", "true");
  await menu.getByRole("radio", { name: "Outlined arrow" }).click();
  await expect(
    menu.getByRole("radio", { name: "Outlined arrow" }),
  ).toHaveAttribute("aria-checked", "true");

  // The outlined arrow has a white edge just off its line.
  const [line, edge] = await pixelsOnImage(page, [
    [0.5, 0.5],
    [0.5, 0.5 - 1.8 / IMAGE.height],
  ]);
  expectColor(line, "#424a52", 20);
  expectColor(edge, "#ffffff", 50);

  // Select it, then pull the handle in its middle up: the arrow bends there.
  const now = await onImage(page, 0.5, 0.5);
  await page.mouse.click(now.x, now.y);
  await expect(
    page.getByRole("button", { name: "Delete arrow" }),
  ).toBeVisible();
  await nextFrame(page);
  // Sideways moves along the arrow are ignored: only the bend changes.
  await drag(page, [0.5, 0.5], [0.6, 0.3]);
  const [bent, straight, ...tail] = await pixelsOnImage(page, [
    [0.5, 0.3],
    [0.5, 0.5],
    // The thin tail, which now leaves at 45 degrees (the curve's middle is
    // 60 px up, so its control point is 120 px up, 120 px along), give or
    // take a pixel of screen rounding.
    ...[-1, -0.5, 0, 0.5, 1].map(
      (dy) =>
        [0.2 + 4 / IMAGE.width, 0.5 + (dy - 4) / IMAGE.height] as [
          number,
          number,
        ],
    ),
  ]);
  expectColor(bent, "#424a52", 20);
  expect(isRed(straight)).toBe(true);
  // The ends stay where they were.
  expect(tail.some((pixel) => !isRed(pixel))).toBe(true);
});

test("a line's end is picked from the menu below it", async ({ page }) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await toolbar(page).getByRole("radio", { name: "Charcoal" }).click();
  await pickArrowTool(page, "Line");
  // Choosing the tool opens no menu.
  const ends = page.getByRole("radiogroup", { name: "Line end" });
  await expect(ends).toHaveCount(0);

  await drag(page, [0.2, 0.5], [0.8, 0.5]);
  await nextFrame(page);
  // Flat by default: nothing past the end.
  const [middle, flat] = await pixelsOnImage(page, [
    [0.5, 0.5],
    [0.8, 0.5 - 4 / IMAGE.height],
  ]);
  expectColor(middle, "#424a52", 20);
  expect(isRed(flat)).toBe(true);

  // Hovering the line offers its ends below it; a bar, then a dot.
  const at = await onImage(page, 0.5, 0.5);
  await page.mouse.move(at.x, at.y);
  await expect(ends).toBeVisible();
  await expect(ends.getByRole("radio", { name: "Flat end" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await ends.getByRole("radio", { name: "Bar end" }).click();
  const [bar, start] = await pixelsOnImage(page, [
    [0.8, 0.5 - 4 / IMAGE.height],
    [0.2, 0.5 - 4 / IMAGE.height],
  ]);
  expectColor(bar, "#424a52", 30);
  expect(isRed(start)).toBe(true);
  // Exporting moved the mouse to the Export button, so the menu has gone.
  await page.mouse.move(at.x, at.y);
  await ends.getByRole("radio", { name: "Dot end" }).click();
  const [dot, barGone] = await pixelsOnImage(page, [
    [0.8, 0.5 - 3 / IMAGE.height],
    [0.8, 0.5 - 6 / IMAGE.height],
  ]);
  expectColor(dot, "#424a52", 30);
  expect(isRed(barGone)).toBe(true);

  await page.mouse.click(at.x, at.y);
  await expect(page.getByRole("button", { name: "Delete line" })).toBeVisible();
});

test("holding Shift keeps an arrow or line to 45 degree steps", async ({
  page,
}) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await toolbar(page).getByRole("radio", { name: "Charcoal" }).click();
  await pickArrowTool(page, "Arrow");
  // Dragged a little downhill with Shift: it comes out level.
  await page.keyboard.down("Shift");
  await drag(page, [0.2, 0.3], [0.8, 0.36]);
  await page.keyboard.up("Shift");
  await nextFrame(page);
  const [level, slope] = await pixelsOnImage(page, [
    [0.6, 0.3],
    [0.6, 0.34],
  ]);
  expectColor(level, "#424a52", 20);
  expect(isRed(slope)).toBe(true);

  // A line dragged nearly straight down comes out vertical.
  await pickArrowTool(page, "Line");
  await page.keyboard.down("Shift");
  await drag(page, [0.5, 0.45], [0.53, 0.9]);
  await page.keyboard.up("Shift");
  await nextFrame(page);
  const [upright, leaning] = await pixelsOnImage(page, [
    [0.5, 0.8],
    [0.525, 0.8],
  ]);
  expectColor(upright, "#424a52", 20);
  expect(isRed(leaning)).toBe(true);
});

test("a blur box blurs the screenshot under it, and its slider sets how much", async ({
  page,
}) => {
  const BLUE = [0, 0, 255, 255] as const;
  await upload(
    page,
    makeStripedPng(IMAGE.width, IMAGE.height, 8, RED, [...BLUE]),
  );
  await tool(page, "Blur").click();
  const strength = page.getByRole("slider", { name: "Blur strength" });
  await expect(strength).toBeVisible();
  // Colours are for drawing; a blur has none.
  await expect(
    toolbar(page).getByRole("radiogroup", { name: "Annotation colour" }),
  ).toHaveCount(0);
  await drag(page, [0.3, 0.3], [0.7, 0.7]);
  await nextFrame(page);

  // Inside, the stripes run together; outside they are untouched.
  const mixed = (pixel: number[]) => pixel[0] > 60 && pixel[2] > 60;
  const [inside, outside] = await pixelsOnImage(page, [
    [0.51, 0.5],
    [0.51, 0.15],
  ]);
  expect(mixed(inside)).toBe(true);
  expectColor(outside, "#0000ff", 20);

  // Selected, the slider at its lowest leaves the stripes nearly sharp.
  const at = await onImage(page, 0.5, 0.5);
  await page.mouse.click(at.x, at.y);
  await expect(page.getByRole("button", { name: "Delete blur" })).toBeVisible();
  await strength.focus();
  await page.keyboard.press("Home");
  const [light] = await pixelsOnImage(page, [[0.51, 0.5]]);
  expect(light[2]).toBeGreaterThan(inside[2]);
  expect(light[0]).toBeLessThan(inside[0]);
});

test("a highlight is a see-through fill in its colour, square or rounded", async ({
  page,
}) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await toolbar(page).getByRole("radio", { name: "Charcoal" }).click();
  await pickShape(page, "Highlight");
  // Always just a fill: no choice between filled and outline.
  await expect(tool(page, "Filled shape")).toHaveCount(0);
  await drag(page, [0.3, 0.3], [0.7, 0.7]);
  await nextFrame(page);
  // No border at the edge; inside, the screenshot shows through, tinted.
  const [edge, inside, outside] = await pixelsOnImage(page, [
    [0.3 + 1 / IMAGE.width, 0.5],
    [0.5, 0.5],
    [0.2, 0.5],
  ]);
  expectColor(
    edge,
    `#${inside
      .slice(0, 3)
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("")}`,
    6,
  );
  expect(isRed(inside)).toBe(true);
  expect(inside[0]).toBeLessThan(outside[0] - 20);

  // Recolouring changes the fill.
  const at = await onImage(page, 0.5, 0.5);
  await page.mouse.click(at.x, at.y);
  await expect(
    page.getByRole("button", { name: "Delete highlight" }),
  ).toBeVisible();
  await toolbar(page).getByRole("radio", { name: "Yellow" }).click();
  const corner: [number, number] = [
    0.3 + 0.5 / IMAGE.width,
    0.3 + 0.5 / IMAGE.height,
  ];
  const [yellow, square] = await pixelsOnImage(page, [[0.5, 0.5], corner]);
  expect(yellow[1]).toBeGreaterThan(inside[1] + 20);

  // Square corners by default; rounded ones leave the corner bare.
  expect(square[1]).toBeGreaterThan(20);
  await tool(page, "Rounded corners").click();
  await expect(tool(page, "Rounded corners")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const [rounded] = await pixelsOnImage(page, [corner]);
  expect(rounded[1]).toBeLessThan(10);
});

test("the drawing cursor comes back when the annotation under it is removed", async ({
  page,
}) => {
  await upload(page, makeSolidPng(IMAGE.width, IMAGE.height, RED));
  await pickShape(page, "Highlight");
  await drag(page, [0.3, 0.3], [0.6, 0.6]);
  await nextFrame(page);
  const cursor = () =>
    page.evaluate(
      () =>
        document.querySelector<HTMLElement>(".konvajs-content")?.parentElement
          ?.style.cursor,
    );
  // Over the highlight: it can be picked up.
  const over = await onImage(page, 0.45, 0.45);
  await page.mouse.move(over.x - 40, over.y - 40);
  await page.mouse.move(over.x, over.y, { steps: 3 });
  await expect.poll(cursor).toBe("grab");
  // Undone from under the pointer: back to drawing.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(cursor).toBe("crosshair");
  await page.mouse.move(over.x + 20, over.y + 20, { steps: 3 });
  await expect.poll(cursor).toBe("crosshair");
});

test("the toolbar stays enlarged while one of its menus is open", async ({
  page,
}) => {
  await upload(page, makeSolidPng(1200, 750, RED));
  const bar = page.getByRole("toolbar", { name: "Annotate" });
  const scale = () =>
    bar.evaluate((element) => getComputedStyle(element).scale);
  await bar.getByRole("button", { name: "Choose shape" }).click();
  await expect(page.getByRole("menu", { name: "Shapes" })).toBeVisible();
  // The pointer leaves the toolbar, as it does on its way to the menu.
  await page.mouse.move(5, 5);
  await expect.poll(scale).toBe("1.04");
  // Picking a shape closes the menu; the pointer is then still away.
  await page
    .getByRole("menu", { name: "Shapes" })
    .getByRole("menuitemradio")
    .first()
    .click();
  await page.mouse.move(5, 5);
  await expect(page.getByRole("menu", { name: "Shapes" })).toBeHidden();
  await expect.poll(scale).not.toBe("1.04");
});
