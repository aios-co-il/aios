import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { liveCampaignWindow } from "./live-campaign-window.ts";

describe("liveCampaignWindow", () => {
  it("covers the last N full days, ending yesterday", () => {
    assertEquals(liveCampaignWindow(7, new Date("2026-11-06T10:00:00Z")), {
      start: "2026-10-30",
      end: "2026-11-05",
    });
    assertEquals(liveCampaignWindow(0, new Date("2026-11-06T10:00:00Z")), {
      start: "2026-11-05",
      end: "2026-11-05",
    });
  });
});
