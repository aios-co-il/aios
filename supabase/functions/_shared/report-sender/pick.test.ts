import { assertEquals } from "jsr:@std/assert@1";
import { pickReportSender } from "./pick.ts";
import type { PickableSender } from "./types.ts";

const CALLER = "user-caller";

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
  return "error" in result
    ? { error: result.error }
    : { id: result.sender.id, type: result.type, source: result.source };
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
  "pickReportSender with one line uses it (a Manus-only tenant)",
  () => {
    assertEquals(outcome(pickReportSender({ senders: [carmen] })), {
      id: "carmen",
      type: "manus_wa",
      source: "only_sender",
    });
    // A line shared by another tenant is a line like any other.
    assertEquals(outcome(pickReportSender({ senders: [sharedCarmen] })), {
      id: "shared-carmen",
      type: "manus_wa",
      source: "only_sender",
    });
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
            line("shared-own", { owner_user_id: CALLER, is_shared: true }),
          ],
          callerUserId: CALLER,
        }),
      ),
      { error: "choose_sender" },
    );
  });
});

Deno.test("pickReportSender never replaces a named line", () => {
  // A line of another tenant (not in the list) is refused, not swapped.
  for (const named of [
    { requestedId: "foreign" },
    { scheduleSenderId: "foreign" },
    { tenantDefaultId: "foreign" },
  ]) {
    assertEquals(
      outcome(pickReportSender({ senders: [carmen], ...named })),
      { error: "sender_not_allowed" },
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
    { error: "sender_not_allowed" },
  );
  assertEquals(
    outcome(
      pickReportSender({
        senders: [carmen, line("meta", { integration_type: "meta_whatsapp" })],
        requestedId: "meta",
      }),
    ),
    { error: "sender_not_allowed" },
  );
});
