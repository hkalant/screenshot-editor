import { test as base, expect } from "@playwright/test";

type Options = {
  /** Console errors matching these are expected in a test (e.g. a deliberately broken image). */
  allowedConsoleErrors: RegExp[];
  /** Whether the welcome tour counts as seen, so it doesn't cover the page. */
  tourSeen: boolean;
};

/** Marks the welcome tour as seen in every page of a context. */
export const TOUR_SEEN_SCRIPT = () =>
  window.localStorage.setItem("screenshot-editor:tour-seen", "1");

/**
 * Every test fails if the page throws, logs a console error, or gets a 4xx/5xx
 * response. Against the Bitbucket-like server, a 404 usually means a URL is
 * missing the base path.
 */
export const test = base.extend<Options & { pageProblems: string[] }>({
  allowedConsoleErrors: [[], { option: true }],
  tourSeen: [true, { option: true }],
  context: async ({ context, tourSeen }, use) => {
    if (tourSeen) await context.addInitScript(TOUR_SEEN_SCRIPT);
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
