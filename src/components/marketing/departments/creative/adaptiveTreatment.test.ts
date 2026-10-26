import { expect, test } from "vitest";
import {
  buildAdaptiveTreatment,
  detectCopyMood,
  isOptionalCostume,
} from "./adaptiveTreatment.ts";

test("detectCopyMood reads urgency, doubt, and screen life from the copy", () => {
  expect(detectCopyMood("וריאציה 1 — פומו תחרותי\nהמתחרים כבר טסים")).toBe(
    "urgent",
  );
  expect(detectCopyMood("אתה עדיין לא יודע אם אתה שם? מתלבט")).toBe("doubt");
  expect(detectCopyMood("עדיין מגלגל בטיקטוק? תפתח צ'אט")).toBe("screen");
  expect(detectCopyMood("רק 99 ש״ח ללילה")).toBe("offer");
});

test("adaptive treatment follows copy, logo colors, and topic — not the style boards", () => {
  const treatment = buildAdaptiveTreatment({
    copyText: `וריאציה 3 — מגולל לצ'אט

כותרת: עדיין מגלגל בטיקטוק?

גוף: תפתח צ'אט. נסגור לך טיסה.`,
    copyLabel: "וריאציה 3 · מגולל לצ'אט",
    title: "Smartair",
    brief: "טיסה ישירה לרודוס",
    brandColors: ["#e11d48", "#111111"],
  });
  expect(treatment).toMatch(/ADAPTIVE STYLE/i);
  expect(treatment).toMatch(/PALETTE IS THE LOGO/i);
  expect(treatment).toMatch(/#e11d48/);
  expect(treatment).toMatch(/מגולל לצ'אט|טיקטוק|צ'אט/);
  expect(treatment).toMatch(/screen life/i);
  expect(treatment).toMatch(/Forbidden default recipes/i);
  expect(treatment).toMatch(/pink-cyan hologram/i);
  expect(treatment).not.toMatch(/dress that same situation in a/);
  expect(treatment).not.toMatch(/Swiss \/ international commercial/i);
});

test("optional costume is a material hint only", () => {
  expect(isOptionalCostume("adaptive")).toBe(false);
  expect(isOptionalCostume("bauhaus")).toBe(true);
  const treatment = buildAdaptiveTreatment({
    copyText: "כותרת: רודוס",
    brandColors: ["#111111"],
    costumeLabel: "באוהאוס",
  });
  expect(treatment).toMatch(/Optional costume hint/i);
  expect(treatment).toMatch(/באוהאוס/);
  expect(treatment).toMatch(/never its palette/i);
});
