import { assertEquals } from "jsr:@std/assert@1";
import { pickReportSender, usableReportSender } from "./pick.ts";
import type { PickableSender } from "./types.ts";

const CALLER = "user-caller";

/**
 * A ready Green API line of the tenant, owned by another member, unless
 * overridden.
 */
function line(
  id: string,
  overrides: Partial<PickableSender> = {},
): PickableSender {
  return {
    id,
    integration_type: "green_api",
    owner_user_id: "user-other",
    is_shared: false,
    ready: true,
    ...overrides,
  };
}

const carmen = line("carmen", { integration_type: "manus_wa" });
const ownGreen = line("own-green", { owner_user_id: CALLER });
const colleagueGreen = line("colleague-green");
const sharedCarmen = line("shared-carmen", {
  integration_type: "manus_wa",
  is_shared: true,
});

/** The id and source a pick resolved to, or its error. */
function outcome(result: ReturnType<typeof pickReportSender>) {
  if ("sender" in result) {
    return { id: result.sender.id, type: result.type, source: result.source };
  }
  return "refused" in result
    ? { error: result.error, refused: result.refused }
    : { error: result.error };
}

Deno.test("pickReportSender with no line", () => {
  assertEquals(outcome(pickReportSender({ senders: [] })), {
    error: "no_report_sender",
  });
  // A line that is not ready (no token yet) cannot send.
  assertEquals(
    outcome(pickReportSender({ senders: [line("x", { ready: false })] })),
    { error: "no_report_sender" },
  );
});

Deno.test(
  "pickReportSender with one own line uses it (a Manus-only tenant)",
  () => {
    assertEquals(outcome(pickReportSender({ senders: [carmen] })), {
      id: "carmen",
      type: "manus_wa",
      source: "only_sender",
    });
    // A line shared by another tenant does not count against it.
    assertEquals(
      outcome(pickReportSender({ senders: [carmen, sharedCarmen] })),
      { id: "carmen", type: "manus_wa", source: "only_sender" },
    );
    // Lines that are not ready do not count.
    assertEquals(
      outcome(
        pickReportSender({
          senders: [carmen, line("broken", { ready: false })],
        }),
      ).source,
      "only_sender",
    );
  },
);

Deno.test("pickReportSender with several lines", async (t) => {
  const senders = [carmen, ownGreen, colleagueGreen, sharedCarmen];

  await t.step("the line picked for this send wins", () => {
    assertEquals(
      outcome(
        pickReportSender({
          senders,
          requestedId: "shared-carmen",
          scheduleSenderId: "colleague-green",
          tenantDefaultId: "carmen",
          callerUserId: CALLER,
        }),
      ),
      { id: "shared-carmen", type: "manus_wa", source: "requested" },
    );
  });

  await t.step("then the schedule's line, then the tenant default", () => {
    assertEquals(
      outcome(
        pickReportSender({
          senders,
          scheduleSenderId: "colleague-green",
          tenantDefaultId: "carmen",
        }),
      ).source,
      "schedule",
    );
    assertEquals(
      outcome(pickReportSender({ senders, tenantDefaultId: "carmen" })),
      { id: "carmen", type: "manus_wa", source: "tenant_default" },
    );
  });

  await t.step("without a choice, the caller's own Green API line", () => {
    assertEquals(outcome(pickReportSender({ senders, callerUserId: CALLER })), {
      id: "own-green",
      type: "green_api",
      source: "own_line",
    });
  });

  await t.step("nothing to go by asks for a choice", () => {
    assertEquals(
      outcome(pickReportSender({ senders, callerUserId: "user-new" })),
      { error: "choose_sender" },
    );
    // Someone else's line shared into the tenant is never "own".
    assertEquals(
      outcome(
        pickReportSender({
          senders: [
            carmen,
            colleagueGreen,
            line("shared-own", { owner_user_id: CALLER, is_shared: true }),
          ],
          callerUserId: CALLER,
        }),
      ),
      { error: "choose_sender" },
    );
  });
});

Deno.test(
  "pickReportSender never picks a shared line on its own",
  async (t) => {
    await t.step("the only ready line, when shared, asks for a choice", () => {
      assertEquals(outcome(pickReportSender({ senders: [sharedCarmen] })), {
        error: "choose_sender",
      });
    });

    await t.step("a shared line chosen for the send is used", () => {
      assertEquals(
        outcome(
          pickReportSender({
            senders: [sharedCarmen],
            requestedId: "shared-carmen",
          }),
        ),
        { id: "shared-carmen", type: "manus_wa", source: "requested" },
      );
    });

    await t.step("so is a shared line an owner set as the default", () => {
      assertEquals(
        outcome(
          pickReportSender({
            senders: [ownGreen, sharedCarmen],
            tenantDefaultId: "shared-carmen",
          }),
        ),
        { id: "shared-carmen", type: "manus_wa", source: "tenant_default" },
      );
    });
  },
);

Deno.test("pickReportSender never replaces a named line", () => {
  // A line of another tenant (not in the list) is refused, not swapped.
  for (const [named, refused] of [
    [{ requestedId: "foreign" }, "requested"],
    [{ scheduleSenderId: "foreign" }, "schedule"],
  ] as const) {
    assertEquals(
      outcome(pickReportSender({ senders: [carmen], ...named })),
      { error: "sender_not_allowed", refused },
      JSON.stringify(named),
    );
  }
  // So is a named line that is not ready, or a Meta Cloud number.
  assertEquals(
    outcome(
      pickReportSender({
        senders: [carmen, line("off", { ready: false })],
        requestedId: "off",
      }),
    ),
    { error: "sender_not_allowed", refused: "requested" },
  );
  assertEquals(
    outcome(
      pickReportSender({
        senders: [carmen, line("meta", { integration_type: "meta_whatsapp" })],
        requestedId: "meta",
      }),
    ),
    { error: "sender_not_allowed", refused: "requested" },
  );
});

Deno.test("pickReportSender refuses a stale tenant default", async (t) => {
  const stale = {
    error: "sender_not_allowed",
    refused: "tenant_default",
  } as const;
  // The default line was switched off or unshared: the list no longer
  // returns it, or returns it as not ready.
  for (const senders of [[carmen], [carmen, line("off", { ready: false })]]) {
    await t.step(`even with one ready line left (${senders.length})`, () => {
      assertEquals(
        outcome(pickReportSender({ senders, tenantDefaultId: "off" })),
        stale,
      );
    });
  }

  await t.step("instead of the caller's own line", () => {
    assertEquals(
      outcome(
        pickReportSender({
          senders: [carmen, ownGreen, colleagueGreen],
          tenantDefaultId: "off",
          callerUserId: CALLER,
        }),
      ),
      stale,
    );
  });

  await t.step("a line chosen for the send still goes out", () => {
    assertEquals(
      outcome(
        pickReportSender({
          senders: [carmen],
          requestedId: "carmen",
          tenantDefaultId: "off",
        }),
      ).source,
      "requested",
    );
  });
});

Deno.test("usableReportSender", () => {
  const senders = [carmen, line("off", { ready: false })];
  assertEquals(usableReportSender(senders, "carmen")?.id, "carmen");
  assertEquals(usableReportSender(senders, "off"), null);
  assertEquals(usableReportSender(senders, "gone"), null);
  assertEquals(usableReportSender(senders, null), null);
});
