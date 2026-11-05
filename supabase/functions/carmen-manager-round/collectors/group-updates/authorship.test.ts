import { assertEquals } from "jsr:@std/assert@1";
import { authorshipOf } from "./authorship.ts";
import { message, STAFF_KEY, TENANT } from "./group-fixtures.ts";

const PARTNER = "partner-tenant";
const PARTNER_KEY = "509999999";
// Line numbers: staff for labelling, never a person's words.
const MANUS_LINE_KEY = "505555555";
const PARTNER_LINE_KEY = "507777777";
const staff = {
  keys: new Map<string, string | null>([
    [STAFF_KEY, "u-staff"],
    [PARTNER_KEY, "u-partner"],
    [MANUS_LINE_KEY, null],
    [PARTNER_LINE_KEY, null],
  ]),
  personTenants: new Map([
    [STAFF_KEY, new Set([TENANT])],
    [PARTNER_KEY, new Set([PARTNER])],
  ]),
  tenantsOf: new Map([
    ["u-staff", new Set([TENANT])],
    ["u-partner", new Set([PARTNER])],
  ]),
};

/** Who typed a staff message of the client of TENANT. */
const of = (fields: Parameters<typeof message>[3]) => {
  const result = authorshipOf(
    message("x", "", "", fields),
    "staff",
    staff,
    TENANT,
  );
  return [result.typedByPerson, result.staffUserId];
};

Deno.test("authorshipOf", async (t) => {
  await t.step("a chat send by a login of the client's tenant", () => {
    assertEquals(of({ out: true, sentBy: "u-staff", sendKind: "chat" }), [
      true,
      "u-staff",
    ]);
  });

  await t.step("AIOS's own sends never count, even with a sender", () => {
    for (const sendKind of [
      "automation",
      "broadcast",
      "carmen",
      "staff_alert",
      "report",
      "meeting_summary",
      null,
    ]) {
      assertEquals(
        of({ out: true, sentBy: "u-staff", sendKind }),
        [false, null],
        String(sendKind),
      );
    }
  });

  await t.step(
    "typed on the line's own phone: its user, if a login of the client's tenant",
    () => {
      assertEquals(
        of({ out: true, typedOnPhone: true, lineUserId: "u-staff" }),
        [true, "u-staff"],
      );
      // Sent through the API (no kind), or by AIOS on its own: never.
      assertEquals(of({ out: true, lineUserId: "u-staff" }), [false, null]);
      assertEquals(
        of({
          out: true,
          typedOnPhone: true,
          lineUserId: "u-staff",
          sendKind: "automation",
        }),
        [false, null],
      );
      assertEquals(
        of({ out: true, typedOnPhone: true, lineUserId: "u-partner" }),
        [false, null],
      );
    },
  );

  await t.step("a line's number is never a person's words", () => {
    // Carmen's Manus line (her replies, automations) seen as a sender.
    assertEquals(of({ key: MANUS_LINE_KEY }), [false, null]);
    // A partner's line no tenant monitors, seen as a sender.
    assertEquals(of({ key: PARTNER_LINE_KEY }), [false, null]);
  });

  await t.step("a staff phone counts only for the client's own tenant", () => {
    assertEquals(of({ key: STAFF_KEY }), [true, "u-staff"]);
    assertEquals(of({ key: PARTNER_KEY }), [false, null]);
    assertEquals(of({ out: true, sentBy: "u-partner", sendKind: "chat" }), [
      false,
      null,
    ]);
  });

  await t.step(
    "the client's own words count; an unknown sender's never",
    () => {
      const client = authorshipOf(
        message("c", "", "x"),
        "client",
        staff,
        TENANT,
      );
      const unknown = authorshipOf(
        message("u", "", "x"),
        "unknown",
        staff,
        TENANT,
      );
      assertEquals(
        [client.typedByPerson, unknown.typedByPerson],
        [true, false],
      );
    },
  );
});
