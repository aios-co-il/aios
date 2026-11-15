import { assertEquals } from "jsr:@std/assert@1";
import {
  isCarmenAgentRow,
  pickActiveCarmenAgent,
  pickCarmenAgent,
} from "./carmen-agent.ts";

Deno.test("isCarmenAgentRow finds Carmen after a rename", () => {
  assertEquals(isCarmenAgentRow({ is_carmen: true, name: "מיני מי" }), true);
  assertEquals(isCarmenAgentRow({ is_carmen: false, name: "כרמן" }), true);
  assertEquals(isCarmenAgentRow({ is_carmen: false, name: "מיני מי" }), false);
  assertEquals(isCarmenAgentRow(null), false);
});

Deno.test("pickCarmenAgent", async (t) => {
  const renamed = {
    id: "flagged",
    is_carmen: true,
    name: "מיני מי",
    active: true,
    created_at: "2026-02-01",
  };
  const olderNamed = {
    id: "older",
    is_carmen: false,
    name: "כרמן",
    active: true,
    created_at: "2026-01-01",
  };

  await t.step(
    "prefers the flagged agent over an older Carmen-named one",
    () => {
      assertEquals(pickCarmenAgent([olderNamed, renamed])?.id, "flagged");
    },
  );

  await t.step(
    "without a flag, picks the active Carmen-named agent, then the oldest",
    () => {
      const inactiveOldest = {
        id: "inactive",
        name: "Carmen",
        active: false,
        created_at: "2025-01-01",
      };
      const newer = { ...olderNamed, id: "newer", created_at: "2026-03-01" };
      assertEquals(
        pickCarmenAgent([newer, inactiveOldest, olderNamed])?.id,
        "older",
      );
    },
  );

  await t.step(
    "ignores agents that are neither flagged nor named Carmen",
    () => {
      assertEquals(pickCarmenAgent([{ id: "x", name: "Copywriter" }]), null);
      assertEquals(pickCarmenAgent(null), null);
    },
  );

  await t.step(
    "an inactive flagged Carmen means no active Carmen, not an unflagged substitute",
    () => {
      const turnedOff = { ...renamed, active: false };
      assertEquals(pickCarmenAgent([olderNamed, turnedOff])?.id, "flagged");
      assertEquals(pickActiveCarmenAgent([olderNamed, turnedOff]), null);
      assertEquals(pickActiveCarmenAgent([olderNamed, renamed])?.id, "flagged");
    },
  );
});
