import { describe, expect, it } from "vitest";
import { BLACKLIST_SOURCE_LABELS, isSelfUnsubscribe } from "./blacklistSources";

describe("blacklist sources", () => {
  it("treats a WhatsApp unsubscribe reply as the contact's own request", () => {
    expect(isSelfUnsubscribe("whatsapp_reply")).toBe(true);
    expect(BLACKLIST_SOURCE_LABELS.whatsapp_reply).toBe("ביקש הסרה בוואטסאפ");
  });

  it("does not warn for entries an operator added", () => {
    expect(isSelfUnsubscribe("manual")).toBe(false);
    expect(isSelfUnsubscribe(null)).toBe(false);
  });
});
