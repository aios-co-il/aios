import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  isCampaignOff,
  latestCampaignStatuses,
  operationalCampaignStates,
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

  await t.step(
    "the states the operational check stores read back per campaign",
    () => {
      const settings = {
        operational_campaign_states: operationalCampaignStates([
          {
            id: "e",
            name: "Ended",
            status: "ENABLED",
            primary_status: "ENDED",
            primary_status_reasons: [],
          },
          {
            id: "p",
            name: "Paused",
            status: "PAUSED",
            primary_status: "PAUSED",
            primary_status_reasons: [],
          },
          {
            id: "l",
            name: "Live",
            status: "ENABLED",
            primary_status: "LIMITED",
            primary_status_reasons: [],
          },
        ]),
      };
      const statusOf = (campaign_id: string) =>
        resolveCampaignDeliveryStatus({ campaign_id }, settings);
      assertEquals(
        [statusOf("e"), statusOf("p"), statusOf("l"), statusOf("x")],
        ["ended", "paused", "active", "unknown"],
      );
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
