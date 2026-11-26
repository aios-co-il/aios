import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  type DeviceCardRule,
  deviceCardRule,
  fieldNeverReason,
  holdsAnotherOrigin,
} from "./card-rule.ts";
import { DEVICE_TOOL_NAMES } from "./contract.ts";
import { NO_ORIGINS } from "./never-controllable.test-fixture.ts";

const ORDINARY = "https://shop.example.com/cart";
const MAIL = "https://mail.google.com/mail/u/0/";
const AIOS = "https://staging.aios.co.il/clients";

/** The rule for every tool, in `DEVICE_TOOL_NAMES` order: read, navigate, click, type, screenshot. */
function rules(
  url: string,
  flags: { trusted: boolean; tainted: boolean; sensitivePage?: boolean },
): Array<DeviceCardRule> {
  return DEVICE_TOOL_NAMES.map((tool) =>
    deviceCardRule({ tool, url, origins: NO_ORIGINS, ...flags }),
  );
}

const EVERY_FLAG = [
  { trusted: false, tainted: false },
  { trusted: false, tainted: true },
  { trusted: true, tainted: false },
  { trusted: true, tainted: true },
];

Deno.test("deviceCardRule: the table", async (t) => {
  await t.step("an ordinary site: reading is free, acting asks", () => {
    for (const flags of [EVERY_FLAG[0], EVERY_FLAG[1], EVERY_FLAG[3]]) {
      assertEquals(rules(ORDINARY, flags), [
        "free",
        "ask",
        "ask",
        "ask",
        "free",
      ]);
    }
  });

  await t.step(
    "a trusted site, untainted: clicks and typing are free, navigation still asks",
    () => {
      assertEquals(rules(ORDINARY, EVERY_FLAG[2]), [
        "free",
        "ask",
        "free",
        "free",
        "free",
      ]);
    },
  );

  await t.step(
    "a trusted page with a password or payment field asks again",
    () => {
      assertEquals(rules(ORDINARY, { ...EVERY_FLAG[2], sensitivePage: true }), [
        "free",
        "ask",
        "ask",
        "ask",
        "free",
      ]);
    },
  );

  await t.step(
    "the act floor: reading is free, acting is refused whatever the flags",
    () => {
      for (const flags of EVERY_FLAG) {
        for (const url of [
          MAIL,
          "https://www.paypal.com/",
          "https://x.first.bank/",
        ]) {
          assertEquals(rules(url, flags), [
            "free",
            "never",
            "never",
            "never",
            "free",
          ]);
        }
      }
    },
  );

  await t.step(
    "a never-controllable page: everything is refused whatever the flags",
    () => {
      for (const flags of EVERY_FLAG) {
        for (const url of [
          AIOS,
          "chrome://settings",
          "https://a@example.com/",
          "",
        ]) {
          assertEquals(rules(url, flags), Array(5).fill("never"));
        }
      }
    },
  );

  await t.step("this environment's own addresses are refused", () => {
    const origins = {
      appOrigins: ["https://crm.example.test"],
      backendOrigins: [],
    };

    assertStrictEquals(
      deviceCardRule({
        tool: "browser_read_page",
        url: "https://crm.example.test/x",
        trusted: true,
        tainted: false,
        origins,
      }),
      "never",
    );
  });

  await t.step("a tenant's added host is refused for acting only", () => {
    const step = {
      url: ORDINARY,
      trusted: true,
      tainted: false,
      origins: NO_ORIGINS,
      addedActNeverHosts: ["example.com"],
    };

    assertStrictEquals(
      deviceCardRule({ ...step, tool: "browser_click" }),
      "never",
    );
    assertStrictEquals(
      deviceCardRule({ ...step, tool: "browser_read_page" }),
      "free",
    );
  });
});

Deno.test("holdsAnotherOrigin: the tainted input", () => {
  for (const [origins, expected] of [
    [[], false],
    [["https://shop.example.com"], false],
    [["https://shop.example.com", "https://shop.example.com"], false],
    [["https://shop.example.com", "https://blog.example.com"], true],
    [["http://shop.example.com"], true],
    [["https://shop.example.com:8443"], true],
  ] as const) {
    assertStrictEquals(holdsAnotherOrigin(ORDINARY, origins), expected);
  }
  assertStrictEquals(
    holdsAnotherOrigin("nonsense", ["https://a.example"]),
    true,
  );
});

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
      [{ autocomplete: "cc-number" }, "card"],
      [{ autocomplete: "billing cc-exp" }, "card"],
      [{ type: "tel", names: ["cardNumber"] }, "card"],
      [{ type: "text", names: ["CVV"] }, "card"],
      [{ type: "text", names: ["מספר כרטיס אשראי"] }, "card"],
      [{ autocomplete: "one-time-code" }, "one_time_code"],
      [{ type: "text", names: ["otp"] }, "one_time_code"],
      [{ type: "tel", names: ["verification_code"] }, "one_time_code"],
      [{ type: "text", names: ["קוד אימות"] }, "one_time_code"],
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
