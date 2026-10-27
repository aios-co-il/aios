import { assertEquals } from "jsr:@std/assert@1";
import type { Collector } from "../collectors/types.ts";
import { notifyFloors } from "./floors.ts";

const collect: Collector["collect"] = () =>
  Promise.resolve({
    candidates: [],
    watermark: null,
    coverage: { complete: false, clientIds: null },
  });
const contact: Collector = {
  id: "contact",
  kinds: ["no_contact", "contact_not_logged"],
  detectorVersion: "1",
  schedule: { cron: "0 * * * *" },
  collect,
};
const later: Collector = {
  ...contact,
  id: "contact_v2",
  kinds: ["no_contact"],
};
const row = (collector: string, first_run_at: string) => ({
  collector,
  first_run_at,
  last_run_at: null,
  last_slot: null,
  watermark: null,
});

const now = new Date("2026-11-01T08:00:00Z");

Deno.test("notifyFloors", async (t) => {
  await t.step(
    "a kind starts at its collector's first run; the router's kinds at the first round",
    () => {
      const floors = notifyFloors(
        [contact, later],
        [
          row("contact", "2026-10-20T00:00:00Z"),
          row("contact_v2", "2026-10-25T00:00:00Z"),
          row("_round", "2026-10-10T00:00:00Z"),
        ],
        now,
      );
      assertEquals(floors, {
        no_contact: "2026-10-25T00:00:00Z",
        contact_not_logged: "2026-10-20T00:00:00Z",
        no_campaigner: "2026-10-10T00:00:00Z",
        missing_phone: "2026-10-10T00:00:00Z",
      });
    },
  );

  await t.step("a collector on its first run floors its kinds at now", () => {
    const at = now.toISOString();
    assertEquals(notifyFloors([contact], [], now), {
      no_contact: at,
      contact_not_logged: at,
      no_campaigner: at,
      missing_phone: at,
    });
  });

  await t.step("the fixtures-only self-test collector sets no floor", () => {
    const fixture: Collector = {
      ...contact,
      id: "self_test",
      fixturesOnly: true,
    };
    assertEquals(
      Object.keys(notifyFloors([fixture], [row("_round", "2026-10-10")], now)),
      ["no_campaigner", "missing_phone"],
    );
  });
});
