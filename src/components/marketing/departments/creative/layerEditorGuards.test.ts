import { expect, test } from "vitest";
import { inferLayerShadow } from "./layerShadow.ts";
import {
  EDITOR_FONT_WEIGHTS,
  safeFontWeight,
  safeHexColor,
  safeSelectValue,
} from "./layerEditorGuards.ts";
import { buildOfferBoardLayers } from "./offerBoard.ts";

test("offer headlines use a weight the editor Select can render", () => {
  const layers = buildOfferBoardLayers({
    headline: "הלקוח מחפש המלצה ב־AI",
    palette: {
      headline: "#111111",
      body: "#111111",
      pill: "#dc2626",
      pillText: "#ffffff",
      cta: "#dc2626",
      ctaText: "#ffffff",
      band: "#e11d48",
      extrude: "#111111",
    },
    format: "1:1",
  });
  const headline = layers.find((layer) => layer.role === "headline");
  expect(headline?.fontWeight).toBe("900");
  expect(EDITOR_FONT_WEIGHTS.includes("900")).toBeTruthy();
  expect(safeFontWeight(headline?.fontWeight)).toBe("900");
  expect(safeHexColor(headline?.color)).toBe("#111111");
  expect(inferLayerShadow(headline!).shadowStyle).toBe("none");
});

test("safeFontWeight maps unknown weights instead of crashing Select", () => {
  expect(safeFontWeight("500")).toBe("800");
  expect(safeFontWeight(undefined)).toBe("800");
  expect(safeFontWeight("700")).toBe("700");
});

test("safeHexColor only returns #rrggbb for color inputs", () => {
  expect(safeHexColor("#fff")).toBe("#ffffff");
  expect(safeHexColor("rgba(0,0,0,0.4)")).toBe("#111111");
  expect(safeHexColor("#dc2626")).toBe("#dc2626");
});

test("safeSelectValue falls back when an icon name is missing from the list", () => {
  expect(safeSelectValue("nope", ["search", "shield"], "search")).toBe(
    "search",
  );
  expect(safeSelectValue("shield", ["search", "shield"], "search")).toBe(
    "shield",
  );
});
