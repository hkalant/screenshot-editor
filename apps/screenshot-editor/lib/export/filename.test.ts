import { describe, expect, it } from "vitest";
import { cleanStem, originalFilename, suggestedStem } from "./filename";

const now = new Date(2026, 9, 11, 9, 5, 7); // 11 Oct 2026, 09:05:07 local time

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

describe("suggestedStem", () => {
  it("keeps the screenshot's own name, without its extension", () => {
    expect(suggestedStem("My Dashboard.png", now)).toBe("My Dashboard");
    expect(suggestedStem("Écran d’accueil.jpg", now)).toBe("Écran d’accueil");
    expect(suggestedStem("archive.tar.png", now)).toBe("archive.tar");
  });

  it("dates pasted or unnamed images", () => {
    expect(suggestedStem("image.png", now)).toBe("Screenshot 2026-10-11");
    expect(suggestedStem("Pasted image.png", now)).toBe(
      "Screenshot 2026-10-11",
    );
    expect(suggestedStem(null, now)).toBe("Screenshot 2026-10-11");
  });
});

describe("cleanStem", () => {
  it("removes an extension the user typed", () => {
    expect(cleanStem("Onboarding.screenshot.json", [".screenshot.json"])).toBe(
      "Onboarding",
    );
    expect(cleanStem("Shot.PNG", [".png", ".jpg"])).toBe("Shot");
    expect(cleanStem("Shot.png.jpg", [".png", ".jpg"])).toBe("Shot");
  });

  it("drops characters file systems refuse", () => {
    expect(cleanStem('Q3: "final" report/v2?', [])).toBe("Q3 final report v2");
    expect(cleanStem("  ..Notes..  ", [])).toBe("Notes");
    expect(cleanStem("a\u0000b", [])).toBe("a b");
  });

  it("keeps spaces and capitals as typed", () => {
    expect(cleanStem("Moodle Course Page", [".png"])).toBe(
      "Moodle Course Page",
    );
  });

  it("is empty when nothing usable is left", () => {
    expect(cleanStem(" / ", [])).toBe("");
    expect(cleanStem(".png", [".png"])).toBe("");
  });

  it("cuts very long names", () => {
    expect(cleanStem("a".repeat(200), [])).toHaveLength(120);
  });
});
