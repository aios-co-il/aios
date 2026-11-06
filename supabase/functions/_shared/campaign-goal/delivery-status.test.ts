import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  isCampaignOff,
  latestCampaignStatuses,
  resolveCampaignDeliveryStatus,
} from "./delivery-status.ts";

Deno.test("campaign delivery status", async (t) => {
  await t.step(
    "Google's primary status ENDED is ended, even while ENABLED",
    () => {
      const settings = {
        operational_campaign_states: {
          g1: { status: "ENABLED", primary_status: "ENDED" },
          g2: { status: "ENABLED", primary_status: "ELIGIBLE" },
        },
      };
      assertStrictEquals(
        resolveCampaignDeliveryStatus({ campaign_id: "g1" }, settings),
        "ended",
      );
      assertStrictEquals(
        resolveCampaignDeliveryStatus({ campaign_id: "g2" }, settings),
        "active",
      );
      assertStrictEquals(isCampaignOff({ deliveryStatus: "ended" }), true);
    },
  );

  await t.step("the latest dated row that states a status wins", () => {
    const statuses = latestCampaignStatuses(
      [
        { data: { date: "2026-11-05", effective_status: "ACTIVE" } },
        { data: { date: "2026-11-06", effective_status: "PAUSED" } },
        { data: { date: "2026-11-04", effective_status: "ACTIVE" } },
        { data: { date: "2026-11-07" } },
      ],
      () => "c",
    );
    assertEquals([...statuses], [["c", "paused"]]);
  });
});
