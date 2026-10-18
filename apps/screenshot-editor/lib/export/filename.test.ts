import { describe, expect, it } from "vitest";
import { exportFilename, originalFilename, projectFilename } from "./filename";

const now = new Date(2026, 9, 11, 9, 5, 7); // 11 Oct 2026, 09:05:07 local time

describe("exportFilename", () => {
  it("keeps a cleaned-up source name", () => {
    expect(exportFilename("Dashboard.png", 2, now)).toBe("dashboard-2x.png");
    expect(exportFilename("fixture.png", 2, now)).toBe("fixture-2x.png");
    expect(exportFilename("My Great  App (final).PNG", 2, now)).toBe(
      "my-great-app-final-2x.png",
    );
    expect(exportFilename("archive.tar.png", 2, now)).toBe(
      "archive-tar-2x.png",
    );
  });

  it("uses the export format's extension and scale", () => {
    expect(exportFilename("Dashboard.png", 3, now, "jpg")).toBe(
      "dashboard-3x.jpg",
    );
    expect(exportFilename(null, 1, now, "webp")).toBe(
      "screenshot-20261011-090507-1x.webp",
    );
  });

  it("strips accents and other non-ASCII characters", () => {
    expect(exportFilename("Écran d’accueil.jpg", 2, now)).toBe(
      "ecran-d-accueil-2x.png",
    );
    expect(
      exportFilename("スクリーンショット 2026-10-11 10.00.00.png", 2, now),
    ).toBe("2026-10-11-10-00-00-2x.png");
  });

  it("uses a timestamp for pasted or unnamed images", () => {
    expect(exportFilename("image.png", 2, now)).toBe(
      "screenshot-20261011-090507-2x.png",
    );
    expect(exportFilename("blob", 2, now)).toBe(
      "screenshot-20261011-090507-2x.png",
    );
    expect(exportFilename("スクリーン.png", 2, now)).toBe(
      "screenshot-20261011-090507-2x.png",
    );
    expect(exportFilename(null, 2, now)).toBe(
      "screenshot-20261011-090507-2x.png",
    );
  });

  it("cuts very long names to 60 characters without a trailing dash", () => {
    const name = `${"a".repeat(59)} b${"c".repeat(40)}.png`;
    const result = exportFilename(name, 2, now);
    expect(result).toBe(`${"a".repeat(59)}-2x.png`);
  });
});

describe("originalFilename", () => {
  it("marks the name as the original and keeps the file's own format", () => {
    expect(originalFilename("My Dashboard.png", "image/png", now)).toBe(
      "my-dashboard-original.png",
    );
    expect(originalFilename("photo.JPEG", "image/jpeg", now)).toBe(
      "photo-original.jpg",
    );
    expect(originalFilename("shot.webp", "", now)).toBe("shot-original.webp");
  });

  it("names a pasted image by the time", () => {
    expect(originalFilename("image.png", "image/png", now)).toBe(
      "screenshot-20261011-090507-original.png",
    );
    expect(originalFilename(null, "", now)).toBe(
      "screenshot-20261011-090507-original.png",
    );
  });
});

describe("projectFilename", () => {
  it("names the project after the screenshot", () => {
    expect(projectFilename("My Dashboard.png", now)).toBe(
      "my-dashboard.screenshot.json",
    );
    expect(projectFilename(null, now)).toBe(
      "screenshot-20261011-090507.screenshot.json",
    );
  });
});
