import { assertEquals } from "jsr:@std/assert@1";
import { resolveManagerSettings } from "../../../_shared/manager-round/settings.ts";
import { NOW, SETTINGS } from "../../tests/chat-fixtures.ts";
import { CHAT_KINDS, enabledKinds, readSince, THREAD_KINDS } from "./scope.ts";

const WEEK_AGO = new Date("2026-10-20T12:00:00Z");

Deno.test("enabledKinds", async (t) => {
  await t.step("a kind turned off, or set to off, is left out", () => {
    assertEquals(enabledKinds(SETTINGS), [...CHAT_KINDS]);
    const settings = resolveManagerSettings({
      manager: {
        kinds: {
          unanswered_request: { enabled: false },
          unlinked_group: { mode: "off" },
        },
      },
    });
    assertEquals(enabledKinds(settings), ["client_complaint"]);
  });
});

Deno.test("readSince", async (t) => {
  await t.step("7 days back while a kind only observes", () => {
    assertEquals(
      readSince({ settings: SETTINGS, now: NOW }, CHAT_KINDS),
      WEEK_AGO,
    );
    const mixed = resolveManagerSettings({
      manager: {
        mode: "david_only",
        notify_since: "2026-10-26T06:00:00Z",
        kinds: { unlinked_group: { mode: "observe" } },
      },
    });
    assertEquals(
      readSince({ settings: mixed, now: NOW }, CHAT_KINDS),
      WEEK_AGO,
    );
    assertEquals(
      readSince({ settings: mixed, now: NOW }, THREAD_KINDS),
      new Date("2026-10-26T06:00:00Z"),
    );
  });

  await t.step("the earliest notify_since when every kind sends", () => {
    const sending = resolveManagerSettings({
      manager: { mode: "david_only", notify_since: "2026-10-26T06:00:00Z" },
    });
    const stamp = new Date("2026-10-26T06:00:00Z");
    assertEquals(readSince({ settings: sending, now: NOW }, CHAT_KINDS), stamp);
    const old = resolveManagerSettings({
      manager: { mode: "team", notify_since: "2026-09-01T06:00:00Z" },
    });
    assertEquals(readSince({ settings: old, now: NOW }, CHAT_KINDS), WEEK_AGO);
  });
});
