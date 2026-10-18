# Screenshot Editor

Make screenshots look good: put them on a background, in a window frame, with padding, rounded corners and a shadow, then export or copy the image. Everything runs in the browser; images never leave your machine.

This is milestone 2 of the plan in [`docs/screenshot-editor-plan.md`](../../docs/screenshot-editor-plan.md); [`docs/screenshot-editor-m2-spec.md`](../../docs/screenshot-editor-m2-spec.md) describes how it is built. It is built with Next.js 16 as a **static export**, so it can be hosted on any static file host, including a subfolder of a Bitbucket Cloud website (`https://<workspace>.bitbucket.io/screenshot-editor/`).

## Features

- **Adding a screenshot:** the editor opens on an empty, dotted drop area. Drag a screenshot onto it, paste one with Ctrl+V or ⌘V, click the area to pick a file, or try the sample image.
- **Zoom:** buttons under the canvas zoom the preview out and in (10% to 200%, scrolling when it is bigger than the workspace) and reset it to fit. A new screenshot starts fitted. Zooming never changes the export.
- **Canvas sizes:** Desktop (1920 × 1080, the default), Auto (the screenshot plus padding), presets for X, LinkedIn, Open Graph, Instagram, stories and YouTube, or a custom size up to 4000 × 4000.
- **Backgrounds:** an image (a linear gradient, or your own upload with blur) or a solid colour.
- **Style:** the tool also holds the frame (macOS window, macOS browser, Windows window, Windows browser, or minimal bar, each light or dark, with a window title or address), shadow presets (None, Soft, Medium, Floating; Medium by default) and a border (10px white at 30% opacity by default). The padding can be set from 0 to 200px (72px by default). The corner radius is fixed at 15px and the screenshot is not rotated.
- **Annotations:** a toolbar above the canvas adds numbered steps (circles with a soft shadow that count up, with a button to start again from 1 and a field to change a step's number, digits only) shapes (rectangle, rounded rectangle, circle; filled or outlined) and arrows (drag from where the arrow starts to where it points, or click to place one pointing at the click). Arrows come in four styles: tapered (the default), open, outlined (a white edge, for dark or busy screenshots) and classic. Hover over an arrow (or select it) for a menu of styles below it; new arrows take the last style picked. Lines are drawn the same way, and a line can be stretched and bent like an arrow; hover over one (or select it) for a menu of ends below it (flat, dot, round or a bar across; the start stays plain), and new lines take the last end picked. Hold Shift while drawing an arrow or line, or dragging one of its ends, to keep it straight across, up and down or at 45°. The highlight tool draws a see-through rectangle (its colour at 20% opacity, no border), so what is under it still shows; recolour it like any shape, and the corner buttons that replace Filled/Outline make it square or rounded (new highlights match). The blur tool draws a box that blurs the screenshot under it (to hide names or other private details); move and resize it like a shape, and set its strength with the slider that replaces the colours in the toolbar while the blur tool or a blur box is selected (new boxes take the last strength). Steps, shapes and arrows come only in charcoal (#424A52), pink (#D10373) and yellow (#F9C909). Annotations can go anywhere on the canvas, on the screenshot or the background, and move with the screenshot. With any tool on, press one to select it and drag it (an outline shape is picked up by its border while drawing, so steps can go inside it); resize a step (from its corners; new steps then match it) or a shape, drag either end of a selected arrow or the handle in its middle (which bends it to either side, evenly, and only across the arrow), recolour it, or delete it with the button that appears above it, the bin in the toolbar or the Delete key. Escape deselects, then puts the tool down. On a fixed canvas size, the handle below the screenshot moves it whatever tool is on.
- **Export:** PNG, JPEG or WebP at 1× or 2×, or copy a PNG to the clipboard. Exports larger than the browser allows are reduced to the largest size it can make, and the editor says so. The export menu also downloads the **original screenshot**: the very file that was imported or pasted, with no background, frame or annotations, to start over from (**Export both** downloads the export and the original together).
- **Projects:** Save project (in the More menu) downloads a `.screenshot.json` file with the design, every annotation still editable, and the original images inside it. Open project, or picking or dropping the file like an image, reopens it in place of the current design, as one undo step. Project files are checked as strictly as uploads; older ones are migrated, and ones from a newer version are refused with a message.
- **Undo and redo**, and **autosave**: the last design and its images are kept in this browser (IndexedDB) and restored on the next visit.
- **Phones and tablets:** a mobile layout with the settings in a panel under the canvas.
- **Light and dark** interface, following the system setting unless you pick one.

### Keyboard shortcuts

The keyboard button in the top bar, next to the info button, lists these.

| Keys                                                      | Action                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| ⌘V / Ctrl+V                                               | Paste a screenshot                                               |
| ⌘Z / Ctrl+Z                                               | Undo                                                             |
| ⇧⌘Z / Ctrl+Shift+Z or Ctrl+Y                              | Redo                                                             |
| ⌘S / Ctrl+S                                               | Export                                                           |
| ⌘C / Ctrl+C (with no text selected), ⇧⌘C / Ctrl+Shift+C   | Copy the image                                                   |
| ⌘O / Ctrl+O                                               | Open a screenshot                                                |
| ⇧⌘S / Ctrl+Shift+S                                        | Save project                                                     |
| ⇧⌘O / Ctrl+Shift+O                                        | Open project                                                     |
| Delete or Backspace (with the canvas focused: click it)   | Remove the screenshot (undoable)                                 |
| Arrow keys (Shift for 10 px)                              | Move the screenshot, with the canvas focused, on a fixed size    |
| Shift while drawing an arrow or line, or dragging its end | Keep it to 45° steps (straight across, up and down, or diagonal) |
| Esc                                                       | Deselect, then put the drawing tool down                         |

## Scripts

Run these from `apps/screenshot-editor/`. Use Node 22 (see `.nvmrc`).

| Command                           | What it does                                                               |
| --------------------------------- | -------------------------------------------------------------------------- |
| `npm install`                     | Install dependencies                                                       |
| `npm run dev`                     | Development server at http://localhost:3000 (the site opens on the editor) |
| `npm run build`                   | Static export into `out/`                                                  |
| `npm run preview`                 | Serve `out/` the way Bitbucket would (see below)                           |
| `npm run lint`                    | ESLint (must stay on ESLint 9 for `eslint-config-next`)                    |
| `npm run typecheck`               | Generate route types, then `tsc --noEmit`                                  |
| `npm run format` / `format:check` | Prettier                                                                   |
| `npm test`                        | Unit tests (Vitest)                                                        |
| `npm run test:e2e`                | Browser tests (Playwright) against the built `out/` folder                 |
| `npm run test:publish`            | Tests the Bitbucket deploy script against local git repos                  |

Always run ESLint and TypeScript through these scripts. Global installs of newer versions (ESLint 10, TypeScript 6+) behave differently.

## How the subfolder works

The site's path prefix comes from one environment variable, `NEXT_PUBLIC_BASE_PATH`:

- Empty (the default) serves the app at the site root. That is what `npm run dev` uses.
- CI builds with `/screenshot-editor`.
- It must be empty or match `^/[a-z0-9][a-z0-9-]*$` (one lowercase segment, no trailing slash). Anything else stops the build with an error.

`next.config.ts` turns on `output: "export"`, sets `basePath` from the variable, and uses `trailingSlash: true`, so a folder path is served from its `index.html`. Next adds the prefix to its own scripts, styles, fonts, links and imported images. A file in `public/` referenced by hand needs `withBasePath()` from `lib/paths.ts`.

Because the site is static, these Next.js features are off limits: server actions, route handlers that read the request, middleware, rewrites, redirects, custom headers, ISR, `next/image` optimisation, `next/font/google` and dynamic routes without `generateStaticParams`.

### Try the Bitbucket-style build locally

```bash
NEXT_PUBLIC_BASE_PATH=/screenshot-editor npm run build
npm run preview
```

Then open http://127.0.0.1:4173/screenshot-editor/ (with the trailing slash). Run the two commands separately: a variable set in front of the first command does not reach the second. In PowerShell, run `$env:NEXT_PUBLIC_BASE_PATH='/screenshot-editor'` before `npm run build`.

`scripts/static-server.mjs` is strict on purpose: it only serves files under the base path, maps `dir/` to `dir/index.html`, and returns 404 for everything else, including `/screenshot-editor` without the slash. A URL that is missing the prefix therefore fails here instead of on the live site. `npm run test:e2e` uses the same server.

## Deploying to Bitbucket

Two GitHub Actions workflows in the repository root handle this:

- **`.github/workflows/ci.yml`** runs on every pull request: format check, lint, type check, unit tests, deploy-script tests, the static build with `/screenshot-editor`, and the browser tests in Chromium, Firefox and WebKit.
- **`.github/workflows/deploy-bitbucket.yml`** runs on every push to `main` that touches the app (and can be started by hand on `main`). It runs the same checks, then copies the built site into the `screenshot-editor/` folder of your Bitbucket website repository and pushes it. Nothing outside that folder is changed, so the rest of the repository stays free for your portfolio.

### One-time setup

1. **Find your workspace ID.** It is the part after `bitbucket.org/` in your workspace URL (also under _Workspace settings_).
2. **Create the website repository.** In that workspace, create a repository named exactly `<workspace-id>.bitbucket.io`. It can be empty. Bitbucket serves its files at `https://<workspace-id>.bitbucket.io/`.
3. **Create a repository access token** for that repository: _Repository settings → Security → Access tokens_. Give it the **Repositories: Write** permission and copy it (it is shown once). If you set an expiry date, renew the token before it expires. Do not use an app password: Atlassian has deprecated them.
4. **Add the settings to GitHub.** In `hkalant/portfolio` go to _Settings → Secrets and variables → Actions_ and add:

   | Name                       | Kind                    | Required | Value                                                                                       |
   | -------------------------- | ----------------------- | -------- | ------------------------------------------------------------------------------------------- |
   | `BITBUCKET_TOKEN`          | Repository **secret**   | Yes      | The access token from step 3                                                                |
   | `BITBUCKET_WORKSPACE`      | Repository **variable** | Yes      | The workspace ID from step 1                                                                |
   | `BITBUCKET_SITE_SUBFOLDER` | Variable                | No       | Folder and URL path for the app. Default `screenshot-editor`                                |
   | `BITBUCKET_PAGES_BRANCH`   | Variable                | No       | Branch Bitbucket serves. Default: the repository's default branch, or `main` if it is empty |
   | `BITBUCKET_GIT_USERNAME`   | Variable                | No       | Git user name for the token. Default `x-token-auth` (right for repository access tokens)    |

5. **Deploy.** Merge to `main`, or run _Deploy to Bitbucket_ from the Actions tab on `main`. Then open `https://<workspace-id>.bitbucket.io/screenshot-editor/`, which opens straight on the editor. Share links with the trailing slash.

Until both `BITBUCKET_TOKEN` and `BITBUCKET_WORKSPACE` exist, the deploy job is skipped with a notice and the run stays green. If only one of them is set, the run fails and names the missing one.

### What a deploy does

- Builds the site with `NEXT_PUBLIC_BASE_PATH=/screenshot-editor` and refuses to publish a build made without that prefix, or an incomplete one (a page or script it links to is missing).
- Fetches the website repository, replaces the contents of `screenshot-editor/` with the new build, and writes `screenshot-editor/version.json` with the commit it came from.
- Keeps old files under `screenshot-editor/_next/static/`, so visitors with an old page cached don't hit missing scripts. This makes the repository grow slowly. To clean up, delete `screenshot-editor/_next/static/` in the Bitbucket repository and run the deploy again.
- Commits as `github-actions[bot]` and pushes without forcing. If the same build is already deployed, it makes no commit. If the push fails (for example because you pushed to the site repository at the same moment), it starts again from the new tip, up to three times.
- Re-running an old workflow run never publishes over a newer deploy: if `main` has changed the app or the workflows since, that run skips publishing.
- Afterwards it checks the live site: it waits up to 5 minutes for `version.json` to show the new commit, then checks that the pages and their scripts and styles load with the right content types. If the new version never appears, the job only warns, because Bitbucket may take a while or serve a different branch.

### Bitbucket facts this setup relies on

The Atlassian documentation could not be checked while this was written, so these are from memory. The post-deploy check reports the uncertain ones on the first real deploy.

| Claim                                                                                                                                       | Confidence                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| A repository named `<workspace-id>.bitbucket.io` is published at `https://<workspace-id>.bitbucket.io/`, one site per workspace, over HTTPS | High                                                |
| Subfolders are served, and `/folder/` returns `folder/index.html`                                                                           | Medium-high                                         |
| `/screenshot-editor` without the trailing slash redirects to `/screenshot-editor/`                                                          | Unknown; always link with the slash                 |
| The site is served from the repository's main (default) branch                                                                              | Medium. Set `BITBUCKET_PAGES_BRANCH` if not         |
| A private website repository still publishes a public site                                                                                  | Low. If nothing appears, make the repository public |
| No Jekyll-style processing, so the `_next/` folder is served as is                                                                          | Medium-high                                         |
| Files get correct content types (`.js`, `.css`, `.woff2`, `.txt`)                                                                           | Medium                                              |
| Custom domains are not supported                                                                                                            | Medium-high                                         |
| Git over HTTPS with a repository access token uses the user name `x-token-auth` and the token as password                                   | High                                                |
| Repository access tokens are available on the Free plan                                                                                     | Medium                                              |
| App passwords are deprecated (no new ones since September 2025; existing ones stopped working around June 2026)                             | Medium on the dates                                 |
| SSH access keys on a repository are read-only, so they cannot push                                                                          | High                                                |
| Workspace IDs containing `_` work as `bitbucket.io` host names                                                                              | Low; the deploy warns about them                    |
| Changes appear within seconds to minutes                                                                                                    | Unknown                                             |

### Troubleshooting

| Symptom                                              | Likely cause                                                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Deploy job shows as skipped                          | `BITBUCKET_TOKEN` or `BITBUCKET_WORKSPACE` is missing, or the run was not on `main`                                    |
| `403` or authentication error on push                | Wrong token permission, expired token, or the token belongs to another repository                                      |
| Live check warns that the new version never appeared | Bitbucket serves a different branch (set `BITBUCKET_PAGES_BRANCH`), the repository is private, or it is still updating |
| Blank page or missing styles                         | The build has the wrong base path; check `NEXT_PUBLIC_BASE_PATH` in the build log                                      |
| Old version still showing                            | Browser or CDN cache; reload, or wait a few minutes                                                                    |

## Mirroring the code to Bitbucket

`.github/workflows/mirror-bitbucket.yml` keeps a read-only copy of this repository on Bitbucket. After every push to `main`, it pushes `main` and the tags to the Bitbucket repository. GitHub stays where the work happens: the copy is overwritten each time, so anything committed on Bitbucket is lost.

To turn it on:

1. Create an empty repository on Bitbucket. Under **Repository settings → Access tokens**, create a token with **write** access to repositories.
2. On GitHub, under **Settings → Secrets and variables → Actions**, add the secret `BITBUCKET_MIRROR_TOKEN` (the token) and the variable `BITBUCKET_MIRROR_REPO` (`<workspace>/<repository>`).
3. Run **Mirror to Bitbucket** from the Actions tab once, or push to `main`.

Until both are set, the workflow skips itself and stays green. `BITBUCKET_MIRROR_USERNAME` overrides the git username for the token (default `x-token-auth`).

## Project layout

```
app/                    Routes: / (home) and /editor/
components/editor/      Editor shell, panels, controls, canvas (react-konva)
components/ui/          Small shadcn-style components on Radix primitives
lib/design/             Design model (zod schema, migration), presets, frames, layout maths
lib/store/              Zustand store with its own undo history
lib/image/              File checks, loading, downscaling, intake, colour sampling
lib/render/             Canvas drawing helpers (wallpapers, blur, frames)
lib/export/             Export, copy, size limits and file names
lib/persist/            Autosave (IndexedDB), project files and preferences (localStorage)
lib/hooks/              Browser hooks (resize, paste, drop, pixel ratio, shortcuts, autosave, theme)
assets/samples/         Sample screenshot (an Oxford Brookes Moodle course page)
scripts/                Static server, Bitbucket deploy scripts and tests
e2e/                    Playwright tests
```

`components.json` is set up for the shadcn CLI, so `npx shadcn add <component>` works on a machine that can reach ui.shadcn.com. Components added that way may also need `tw-animate-css`.

## Notes

- **Rendering.** The canvas uses Konva. Without a frame, the screenshot is one Konva `Image` with `cornerRadius` and shadow properties; Konva draws the rounded image into a buffer first, so the shadow follows the corners (and the outline of a transparent PNG). This relies on Konva internals, which is why `konva` is pinned exactly and an e2e test checks the pixels.
- **Export.** The export renders the layer at its true size times the chosen scale, whatever the on-screen zoom, so a 1328 × 878 design exports at 2× as 2656 × 1756. Browsers limit canvases (Safari to 16,777,216 pixels in area, all to 16,384 px a side); larger exports are scaled down to fit. The same limits cap the zoom, and a zoomed-in preview on a high-density screen is drawn at a slightly lower pixel density when it would pass them.
- **Large images.** Images over 50 megapixels or 50 MB are refused. Images longer than 3200 px on a side are downscaled when loaded. Screenshots are shown at most 1600 px long in the design, so 2× exports of the largest scale them up.
- **Storage.** Autosave uses an IndexedDB database named `screenshot-editor`, and preferences use localStorage keys starting with `screenshot-editor:`, because every app on the same `bitbucket.io` site shares one browser origin. Private windows or blocked storage just turn autosave off.
- **WebP.** Browsers that can't encode WebP (some Safari versions) show the option disabled.
- **Playwright** is pinned to 1.56.1 to match the Chromium build preinstalled in the cloud sandbox the app was built in. CI installs its own browsers, so upgrading only needs that sandbox to follow.
