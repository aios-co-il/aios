import { describe, expect, it } from "vitest";
import { campaignContinent, type Continent } from "./campaignContinent";

/** Echo's Google Ads campaigns, as the account names them. */
const ECHO: Array<[string, Continent]> = [
  ["טיול משפחות לטנזניה בחנוכה - חיפוש", "africa"],
  ["טיול לפטגוניה - Pmax", "south_america"],
  ["טיול לקרנבלים באירופה - Pmax", "europe"],
  ["טיול לדרום הודו - Pmax", "asia"],
  ["שייט באיים הפולינזיים - Pmax", "oceania"],
  ["ויאטנם קמבודיה - מקס", "asia"],
  ["טיול לארגנטינה, צ'ילה וברזיל - Pmax", "south_america"],
  ["טיול למקסיקו וגואטמלה - Pmax", "north_america"],
  ["טיול ליפן בפריחת הדובדבן - Pmax", "asia"],
  ["טיול לניקרגואה, הונדורס ובליז - Pmax", "north_america"],
  ["טיול לצפון ארגנטינה, צ׳ילה ואי הפסחא - Pmax", "south_america"],
  ["טיול לשלוש הגויאנות - Pmax", "south_america"],
  ["טיול לסרי לנקה צפון ודרום - Pmax", "asia"],
  ["טיול לגאנה, טוגו ובנין - Pmax", "africa"],
  ["טיול לניו זילנד - Pmax", "oceania"],
  ["טיול לאי מדיירה בסימן קרנבל וטבע - Pmax", "europe"],
  ["טיול לאיסלנד בחורף - Pmax", "europe"],
  ["טיול לטאיוואן - Pmax", "asia"],
  ["טיול לאיים האזוריים - Pmax", "europe"],
  ["מערב ארצות הברית - Pmax", "north_america"],
  ["טיול לפרו ובוליביה - Pmax", "south_america"],
  ["הטיול המקיף לאינדונזיה", "asia"],
  ["טיול למאוריציוס וראוניון - Pmax", "africa"],
  ["שייט באיי סיישל - Pmax", "africa"],
  ["טיול לטג'יקיסטן - Pmax", "asia"],
  ["טיול ללאוס - Pmax", "asia"],
  ["קמפיין - אתיופיה סרטון", "africa"],
  ["שייט לאנטארקטיקה", "antarctica"],
  ["טיולי חורף - Pmax", "general"],
  ["טיולי טרקים - Pmax", "general"],
];

describe("campaignContinent", () => {
  it.each(ECHO)("places %s in %s", (name, continent) => {
    expect(campaignContinent(name)).toBe(continent);
  });

  it("matches a destination only as a whole word", () => {
    expect(campaignContinent("פרובנס בקיץ")).toBe("general");
    expect(campaignContinent("Brand search")).toBe("general");
  });

  it("takes the destination the name mentions first", () => {
    expect(campaignContinent("דרום אפריקה ומאוריציוס")).toBe("africa");
    expect(campaignContinent("קובה ופרו")).toBe("north_america");
  });
});
