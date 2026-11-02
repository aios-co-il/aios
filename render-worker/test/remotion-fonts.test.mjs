import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  FILM_FONTS,
  filmFontFamily,
  fontFaces,
} from "../../workers/creative-video/remotion/src/workshop-fonts.ts";
import { FILM_FONTS as WORKER_FONTS } from "../src/compose/title-style.mjs";
import { FILM_FONTS as CARMEN_FONTS } from "../../supabase/functions/_shared/workshop/title-styles.ts";
import { buildWorkshopManifest } from "../src/compose/workshop-manifest.mjs";

const REMOTION = new URL(
  "../../workers/creative-video/remotion/",
  import.meta.url,
);

/** The Hebrew fonts a Workshop film is set in (workers/creative-video/remotion). */
describe("film fonts", () => {
  test("Carmen, the worker and the film know the same fonts", () => {
    const keys = FILM_FONTS.map((font) => font.key);
    expect(WORKER_FONTS).toEqual(keys);
    expect([...CARMEN_FONTS]).toEqual(keys);
  });

  test("every font ships with its file and render-job stages it", () => {
    const job = readFileSync(new URL("render-job.mjs", REMOTION), "utf8");
    for (const font of FILM_FONTS) {
      expect(existsSync(new URL(`public/fonts/${font.file}`, REMOTION))).toBe(
        true,
      );
      expect(job).toContain(`"${font.file}"`);
      expect(job).toContain(`"${font.key}"`);
    }
  });

  test("the chosen font wins, then the brand's, then Heebo", () => {
    expect(filmFontFamily("suez-one", "Rubik")).toBe(
      '"Suez One", Heebo, Arial, sans-serif',
    );
    expect(filmFontFamily(null, "rubik")).toBe(
      '"Rubik", Heebo, Arial, sans-serif',
    );
    expect(filmFontFamily(null, "Frank Ruhl Libre")).toMatch(
      /^"Frank Ruhl Libre"/,
    );
    expect(filmFontFamily(null, "Comic Sans")).toBe("Heebo, Arial, sans-serif");
    expect(filmFontFamily(undefined, undefined)).toBe(
      "Heebo, Arial, sans-serif",
    );
  });

  test("each font is declared from its own file", () => {
    const css = fontFaces((file) => `/static/${file}`);
    for (const font of FILM_FONTS) {
      expect(css).toContain(`font-family: "${font.family}"`);
      expect(css).toContain(`/static/fonts/${font.file}`);
    }
  });

  test("the film's font reaches the manifest", () => {
    const scene = { id: "a", position: 1, clipPath: "a.mp4", durationS: 2 };
    expect(
      buildWorkshopManifest({ aspect: "9:16", font: "rubik", scenes: [scene] })
        .manifest.font,
    ).toBe("rubik");
    expect(
      buildWorkshopManifest({ aspect: "9:16", scenes: [scene] }).manifest.font,
    ).toBeUndefined();
  });
});
