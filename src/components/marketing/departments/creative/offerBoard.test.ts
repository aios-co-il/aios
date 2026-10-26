import { expect, test } from "vitest";
import {
  buildOfferBoardLayers,
  fitCta,
  fitFontSize,
  footerModules,
  parseOfferBullets,
} from "./offerBoard.ts";

test("fitFontSize shrinks long lines and grows short ones", () => {
  expect(
    fitFontSize("AI", 46, 40, 22) >
      fitFontSize("הלקוח עדיין מחפש המלצה בגוגל", 46, 40, 22),
  ).toBeTruthy();
  expect(
    fitFontSize("הלקוח עדיין מחפש המלצה בגוגל ובפייסבוק בלי תוצאה", 46, 40, 22),
  ).toBe(22);
});

test("parseOfferBullets reads marked lines only", () => {
  const bullets = parseOfferBullets(`כותרת: בדיקה
- חיפוש AI
- בדיקת אתר
* אסטרטגיה
גוף: משפט רגיל`);
  expect(bullets).toStrictEqual(["חיפוש AI", "בדיקת אתר", "אסטרטגיה"]);
});

test("footer modules come from copy bullets, not Promo's default services", () => {
  expect(footerModules([])).toStrictEqual([]);
  expect(footerModules(["חיפוש AI"])).toStrictEqual([]);
  const modules = footerModules(["חיפוש AI", "בדיקת אתר", "אסטרטגיה", "ליווי"]);
  expect(modules.map((item) => item.label)).toStrictEqual([
    "חיפוש AI",
    "בדיקת אתר",
    "אסטרטגיה",
    "ליווי",
  ]);
  expect(modules.some((item) => item.label === "ליווי")).toBe(true);
});

test("offer board builds a clean column, black footer, and four icon objects", () => {
  const layers = buildOfferBoardLayers({
    headline: "הלקוח מחפש המלצה ב־AI",
    sub: "בזמן שאתה מתלבט, המתחרים כבר שם",
    bullets: ["חיפוש AI", "בדיקת אתר", "אסטרטגיה", "ליווי"],
    cta: "השאירו פרטים לבדיקת הנוכחות שלכם בצ'אט",
    footerTitle: "מה מקבלים איתנו?",
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
    logoUrl: "https://example.com/logo.png",
    format: "1:1",
  });
  expect(
    layers.some(
      (layer) => layer.role === "type_field" && (layer.width ?? 0) <= 48,
    ),
  ).toBeTruthy();
  expect(layers.some((layer) => layer.role === "divider")).toBeTruthy();
  expect(layers.find((layer) => layer.role === "footer")?.fill).toBe("#111111");
  expect(
    layers.filter((layer) => layer.role === "icon" && (layer.y ?? 0) > 64)
      .length,
  ).toBe(4);
  expect(
    layers.some(
      (layer) => layer.role === "cta" && (layer.text?.length ?? 99) <= 28,
    ),
  ).toBeTruthy();
  expect(
    layers.some(
      (layer) => layer.role === "cta_fill" && layer.fill === "#dc2626",
    ),
  ).toBeTruthy();
  expect(layers.some((layer) => layer.role === "logo")).toBe(false);
});

test("offer board without copy bullets does not stamp Promo's four services", () => {
  const layers = buildOfferBoardLayers({
    headline: "הלקוח מחפש המלצה ב־AI",
    cta: "השאירו פרטים",
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
  expect(layers.filter((layer) => layer.role === "icon_label").length).toBe(0);
  expect(layers.some((layer) => layer.text === "חיפוש AI")).toBe(false);
  expect(layers.some((layer) => layer.text === "מה מקבלים איתנו?")).toBe(false);
  expect(layers.some((layer) => layer.role === "cta")).toBeTruthy();
});

test("fitCta shortens a long button label", () => {
  expect(fitCta("השאירו פרטים")).toBe("השאירו פרטים");
  expect(
    fitCta("השאירו פרטים לבדיקת הנוכחות שלכם בצ'אט").length <= 27,
  ).toBeTruthy();
});
