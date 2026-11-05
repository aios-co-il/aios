import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";

import { fakeSupabase } from "../testing/fake-supabase.ts";
import { automationEnabled, tenantsWithAutomationOff } from "./switches.ts";

const ON = "11111111-1111-4111-8111-111111111111";
const OFF = "22222222-2222-4222-8222-222222222222";
const NO_ROW = "33333333-3333-4333-8333-333333333333";

/** OFF switched the Meta check off; ON stored it on; NO_ROW never saved anything. */
const db = (failing: Record<string, string> = {}) =>
  fakeSupabase(
    {
      carmen_automation_settings: [
        { tenant_id: ON, automation_key: "meta_status_check", enabled: true },
        { tenant_id: OFF, automation_key: "meta_status_check", enabled: false },
        { tenant_id: ON, automation_key: "reconcile_nightly", enabled: false },
      ],
    },
    { failing },
  );

describe("automation switches", () => {
  it("an org with no row is on", async () => {
    assertStrictEquals(
      await automationEnabled(db(), NO_ROW, "meta_status_check"),
      true,
    );
  });

  it("an org that stored the switch off is off, only for that key", async () => {
    assertStrictEquals(
      await automationEnabled(db(), OFF, "meta_status_check"),
      false,
    );
    assertStrictEquals(
      await automationEnabled(db(), OFF, "reconcile_nightly"),
      true,
    );
    assertStrictEquals(
      await automationEnabled(db(), ON, "meta_status_check"),
      true,
    );
  });

  it("lists only the orgs that switched the key off", async () => {
    const off = await tenantsWithAutomationOff(db(), "meta_status_check", [
      ON,
      OFF,
      NO_ROW,
      OFF,
    ]);
    assertEquals([...off], [OFF]);
  });

  it("a failed read throws instead of guessing", async () => {
    await assertRejects(
      () =>
        automationEnabled(
          db({ carmen_automation_settings: "boom" }),
          ON,
          "meta_status_check",
        ),
      Error,
      "automation switches read failed",
    );
  });
});
