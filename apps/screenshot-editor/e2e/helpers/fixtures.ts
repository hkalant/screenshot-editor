import { test as base, expect } from "@playwright/test";

type Options = {
  /** Console errors matching these are expected in a test (e.g. a deliberately broken image). */
  allowedConsoleErrors: RegExp[];
  /** Whether the welcome tour counts as seen, so it doesn't cover the page. */
  tourSeen: boolean;
  /**
   * Whether Chromium's system Save dialog is offered. Off by default: tests
   * can't answer it, so saves ask for the name in the editor instead.
   */
  savePicker: boolean;
};

/** Marks the welcome tour as seen in every page of a context. */
export const TOUR_SEEN_SCRIPT = () =>
  window.localStorage.setItem("screenshot-editor:tour-seen", "1");

/** Hides the system Save dialog, as in browsers without it. */
export const NO_SAVE_PICKER_SCRIPT = () => {
  delete (Window.prototype as { showSaveFilePicker?: unknown })
    .showSaveFilePicker;
  delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
};

/**
 * Every test fails if the page throws, logs a console error, or gets a 4xx/5xx
 * response. Against the Bitbucket-like server, a 404 usually means a URL is
 * missing the base path.
 */
export const test = base.extend<Options & { pageProblems: string[] }>({
  allowedConsoleErrors: [[], { option: true }],
  tourSeen: [true, { option: true }],
  savePicker: [false, { option: true }],
  context: async ({ context, tourSeen, savePicker }, use) => {
    if (tourSeen) await context.addInitScript(TOUR_SEEN_SCRIPT);
    if (!savePicker) await context.addInitScript(NO_SAVE_PICKER_SCRIPT);
    await use(context);
  },
  pageProblems: [
    async ({ page, allowedConsoleErrors }, use) => {
      const problems: string[] = [];
      page.on("pageerror", (error) =>
        problems.push(`page error: ${error.message}`),
      );
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = message.text();
        if (allowedConsoleErrors.some((pattern) => pattern.test(text))) return;
        problems.push(`console error: ${text}`);
      });
      page.on("response", (response) => {
        if (response.status() >= 400)
          problems.push(`HTTP ${response.status()} ${response.url()}`);
      });
      await use(problems);
      expect(
        problems,
        "page errors, console errors or failed requests",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
