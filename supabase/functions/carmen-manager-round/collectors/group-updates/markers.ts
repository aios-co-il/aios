/**
 * Deterministic markers of card-worthy group news, by item type. They make a
 * one-word message ("מאשר") count, and draft the update when the model is out
 * of budget or unavailable. Complaints are left to the chat collector
 * (client_complaint, AIO-252), which owns the complaint word list.
 */
import type { DigestItemType } from "./digest.ts";

const MARKERS: readonly { type: DigestItemType; pattern: RegExp }[] = [
  { type: "budget_change", pattern: /תקציב|₪|\d[\d,]*\s*(?:ש"ח|שח|שקל)/ },
  {
    type: "approval",
    pattern: /מאשר|מאושר|אישרתי|אושר|מסכימ|סגרנו|יאללה תעלו/,
  },
  {
    type: "decision",
    pattern: /החלטנו|הוחלט|לעצור|להפסיק|נעצור|הולכים על|נתחיל/,
  },
  {
    type: "creative_change",
    pattern: /באנר|קריאייטיב|קריאטיב|סרטון|עיצוב|מודעה|גרפיקה/,
  },
  { type: "request", pattern: /אפשר ל|תוכל[יו]? ל|צריך ש|צריכה ש|מבקש|נא ל/ },
];

/** The item types whose marker the text carries, in registry order. */
export function markerTypes(text: string): DigestItemType[] {
  return MARKERS.filter((marker) => marker.pattern.test(text)).map(
    (marker) => marker.type,
  );
}

/** True when the text carries any marker. */
export function hasMarker(text: string): boolean {
  return MARKERS.some((marker) => marker.pattern.test(text));
}
