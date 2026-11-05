import { expect, test } from "vitest";
import {
  CREATIVE_ICONS,
  isCreativeIconId,
  searchCreativeIcons,
} from "./iconLibrary.ts";
import { OFFER_ICON_NAMES } from "./offerBoard.ts";

test("library includes the offer-board icons and extra marketing marks", () => {
  for (const name of OFFER_ICON_NAMES) {
    expect(isCreativeIconId(name), name).toBeTruthy();
  }
  expect(CREATIVE_ICONS.length >= 24).toBeTruthy();
});

test("icon search matches Hebrew labels and English keywords", () => {
  expect(
    searchCreativeIcons("מגפון").some((item) => item.id === "megaphone"),
  ).toBeTruthy();
  expect(
    searchCreativeIcons("whatsapp").some(
      (item) => item.id === "message-circle",
    ),
  ).toBeTruthy();
  expect(searchCreativeIcons("").length).toBe(CREATIVE_ICONS.length);
});
