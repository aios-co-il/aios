import { assertStrictEquals } from "jsr:@std/assert@1";
import { fieldNeverReason } from "./field-rule.ts";

Deno.test("fieldNeverReason", async (t) => {
  await t.step("ordinary fields may be typed into", () => {
    for (const facts of [
      {},
      { type: "text", names: ["first_name", "First name"] },
      { type: "email", autocomplete: "email", names: ["email"] },
      { type: "search", names: ["q", "Search"] },
      { type: "tel", autocomplete: "section-a shipping tel" },
      { type: null, autocomplete: null, names: [null, undefined, "comment"] },
      { type: "text", names: ["passport_number", "postcode", "discount code"] },
      { type: "text", names: ["שם מלא", "קוד קופון", "הודעה"] },
    ]) {
      assertStrictEquals(fieldNeverReason(facts), null, JSON.stringify(facts));
    }
  });

  await t.step("each refused kind, by type, autocomplete or name", () => {
    const cases: Array<[Parameters<typeof fieldNeverReason>[0], string]> = [
      [{ type: "file" }, "file"],
      [{ type: " FILE " }, "file"],
      [{ type: "password" }, "password"],
      [{ type: "text", autocomplete: "current-password" }, "password"],
      [{ autocomplete: "section-x NEW-PASSWORD" }, "password"],
      [{ type: "text", names: ["user_pwd"] }, "password"],
      [{ type: "text", names: [null, "סיסמה"] }, "password"],
      [{ type: "text", autocomplete: "password" }, "password"],
      [{ type: "text", names: ["ססמה"] }, "password"],
      [{ type: "text", names: ["סיסמא"] }, "password"],
      [{ type: "text", names: ["Passphrase"] }, "password"],
      [{ autocomplete: "cc-number" }, "card"],
      [{ autocomplete: "billing cc-exp" }, "card"],
      [{ type: "tel", names: ["cardNumber"] }, "card"],
      [{ type: "text", names: ["CVV"] }, "card"],
      [{ type: "text", names: ["מספר כרטיס אשראי"] }, "card"],
      [{ type: "text", names: ["מספר הכרטיס"] }, "card"],
      [{ type: "text", names: ["כרטיס"] }, "card"],
      [{ type: "text", names: ["תוקף"] }, "card"],
      [{ type: "text", names: ["Expiry date"] }, "card"],
      [{ type: "text", names: ["expiration"] }, "card"],
      [{ type: "text", names: ["Security code"] }, "card"],
      [{ type: "text", names: ["security_code"] }, "card"],
      [{ autocomplete: "one-time-code" }, "one_time_code"],
      [{ type: "text", names: ["otp"] }, "one_time_code"],
      [{ type: "tel", names: ["verification_code"] }, "one_time_code"],
      [{ type: "text", names: ["קוד אימות"] }, "one_time_code"],
      [{ type: "text", names: ["קוד חד פעמי"] }, "one_time_code"],
      [{ type: "text", names: ["קוד חד-פעמי"] }, "one_time_code"],
      [{ type: "text", names: ["קוד SMS"] }, "one_time_code"],
    ];

    for (const [facts, reason] of cases) {
      assertStrictEquals(
        fieldNeverReason(facts),
        reason,
        JSON.stringify(facts),
      );
    }
  });

  // Security rule 8: what the page calls a field never lowers the rule.
  await t.step("a harmless name or type does not clear another hint", () => {
    assertStrictEquals(
      fieldNeverReason({
        type: "password",
        names: ["comment", "Your message"],
      }),
      "password",
    );
    assertStrictEquals(
      fieldNeverReason({
        type: "text",
        autocomplete: "off cc-csc",
        names: ["note"],
      }),
      "card",
    );
    assertStrictEquals(
      fieldNeverReason({
        type: "text",
        autocomplete: "off",
        names: ["note", "otp"],
      }),
      "one_time_code",
    );
  });
});
