/**
 * The Hebrew fonts a Workshop film can be set in, all from Google Fonts under the SIL Open Font
 * License (public/fonts, licenses in public/fonts/licenses). A film uses the one Carmen chose,
 * else the brand's font when it is one of these, else Heebo.
 */

export const FILM_FONTS = [
  { key: "heebo", family: "Heebo", file: "Heebo-Bold.ttf", weight: "100 900" },
  { key: "rubik", family: "Rubik", file: "Rubik.ttf", weight: "300 900" },
  {
    key: "assistant",
    family: "Assistant",
    file: "Assistant.ttf",
    weight: "200 800",
  },
  {
    key: "secular-one",
    family: "Secular One",
    file: "SecularOne-Regular.ttf",
    weight: "400",
  },
  {
    key: "suez-one",
    family: "Suez One",
    file: "SuezOne-Regular.ttf",
    weight: "400",
  },
  {
    key: "frank-ruhl-libre",
    family: "Frank Ruhl Libre",
    file: "FrankRuhlLibre.ttf",
    weight: "300 900",
  },
] as const;

export type FilmFont = (typeof FILM_FONTS)[number]["key"];

const plain = (name: string) => name.toLowerCase().replace(/[\s_-]+/g, "");

/** The font for a key or a brand font name (any case or spacing), or undefined. */
export const filmFontOf = (name: unknown) =>
  typeof name === "string" && name.trim()
    ? FILM_FONTS.find(
        (font) =>
          plain(font.key) === plain(name) || plain(font.family) === plain(name),
      )
    : undefined;

/**
 * The CSS font stack of a film: the chosen font, else the brand's, else Heebo, with Heebo and
 * Arial behind it for any glyph the font lacks.
 */
export function filmFontFamily(font: unknown, brandFont: unknown): string {
  const chosen = filmFontOf(font) ?? filmFontOf(brandFont);
  return chosen && chosen.key !== "heebo"
    ? `"${chosen.family}", Heebo, Arial, sans-serif`
    : "Heebo, Arial, sans-serif";
}

/** The @font-face rules of every film font, for files served at `url(file)`. */
export const fontFaces = (url: (file: string) => string) =>
  FILM_FONTS.map(
    (font) => `@font-face {
  font-family: "${font.family}";
  src: url("${url(`fonts/${font.file}`)}") format("truetype");
  font-weight: ${font.weight};
  font-style: normal;
}`,
  ).join("\n");
