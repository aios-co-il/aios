import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "jsr:@std/assert@1";
import {
  type DeviceCardRule,
  deviceCardRule,
  holdsAnotherOrigin,
} from "./card-rule.ts";
import { DEVICE_TOOL_NAMES } from "./contract.ts";
import { NO_ORIGINS } from "./never-controllable.test-fixture.ts";

const ORDINARY = "https://shop.example.com/cart";
const MAIL = "https://mail.google.com/mail/u/0/";
const AIOS = "https://staging.aios.co.il/clients";

/**
 * The rule table, one row per kind of page; the columns are the tools in
 * `DEVICE_TOOL_NAMES` order: read, navigate, click, type, screenshot.
 *
 * | page                                  | read  | navigate | click | type  | screenshot |
 * | ------------------------------------- | ----- | -------- | ----- | ----- | ---------- |
 * | ordinary                              | free  | ask      | ask   | ask   | free       |
 * | ordinary, trusted and untainted       | free  | ask      | free  | free  | free       |
 * | sensitive (password or payment field) | free  | ask      | ask   | ask   | never      |
 * | sensitive, with the permission        | free  | ask      | ask   | ask   | ask        |
 * | act floor (built-in or tenant host)   | free  | never    | never | never | never      |
 * | act floor, with the permission        | free  | never    | never | never | ask        |
 * | never-controllable                    | never | never    | never | never | never      |
 *
 * "The permission" is `sensitiveScreenshotsAllowed`. It changes the screenshot column of
 * the sensitive and act-floor rows and nothing else.
 */
type Flags = {
  trusted: boolean;
  tainted: boolean;
  sensitivePage?: boolean;
  sensitiveScreenshotsAllowed?: boolean;
};

/** The rule for every tool, in `DEVICE_TOOL_NAMES` order. */
function rules(url: string, flags: Flags): Array<DeviceCardRule> {
  return DEVICE_TOOL_NAMES.map((tool) =>
    deviceCardRule({
      tool,
      url,
      origins: NO_ORIGINS,
      addedActNeverHosts: [],
      sensitivePage: false,
      sensitiveScreenshotsAllowed: false,
      ...flags,
    }),
  );
}

const ACT_FLOOR = [
  MAIL,
  "https://web.whatsapp.com/",
  "https://www.leumi.co.il/",
  "https://www.paypal.com/",
  "https://x.first.bank/",
  // A fully qualified name is the same site.
  "https://www.paypal.com./",
  "https://MAIL.GOOGLE.COM./mail/",
];

const EVERY_FLAG = [
  { trusted: false, tainted: false },
  { trusted: false, tainted: true },
  { trusted: true, tainted: false },
  { trusted: true, tainted: true },
];

Deno.test("deviceCardRule: the table", async (t) => {
  await t.step("an ordinary site: reading is free, acting asks", () => {
    for (const flags of [EVERY_FLAG[0], EVERY_FLAG[1], EVERY_FLAG[3]]) {
      for (const sensitiveScreenshotsAllowed of [false, true]) {
        assertEquals(
          rules(ORDINARY, { ...flags, sensitiveScreenshotsAllowed }),
          ["free", "ask", "ask", "ask", "free"],
        );
      }
    }
  });

  await t.step(
    "a trusted site, untainted: clicks and typing are free, navigation still asks",
    () => {
      for (const sensitiveScreenshotsAllowed of [false, true]) {
        assertEquals(
          rules(ORDINARY, { ...EVERY_FLAG[2], sensitiveScreenshotsAllowed }),
          ["free", "ask", "free", "free", "free"],
        );
      }
    },
  );

  await t.step(
    "a page with a password or payment field: acting asks again, a picture is refused",
    () => {
      for (const flags of EVERY_FLAG) {
        assertEquals(rules(ORDINARY, { ...flags, sensitivePage: true }), [
          "free",
          "ask",
          "ask",
          "ask",
          "never",
        ]);
      }
    },
  );

  await t.step(
    "a page with a password or payment field, with the permission: a picture asks, also on a trusted site",
    () => {
      for (const flags of EVERY_FLAG) {
        assertEquals(
          rules(ORDINARY, {
            ...flags,
            sensitivePage: true,
            sensitiveScreenshotsAllowed: true,
          }),
          ["free", "ask", "ask", "ask", "ask"],
        );
      }
    },
  );

  await t.step(
    "the act floor: reading text is free, acting and pictures are refused whatever the flags",
    () => {
      for (const flags of EVERY_FLAG) {
        for (const url of ACT_FLOOR) {
          for (const sensitivePage of [false, true]) {
            assertEquals(rules(url, { ...flags, sensitivePage }), [
              "free",
              "never",
              "never",
              "never",
              "never",
            ]);
          }
        }
      }
    },
  );

  await t.step(
    "the act floor, with the permission: a picture asks whatever the flags, acting stays refused",
    () => {
      for (const flags of EVERY_FLAG) {
        for (const url of ACT_FLOOR) {
          for (const sensitivePage of [false, true]) {
            assertEquals(
              rules(url, {
                ...flags,
                sensitivePage,
                sensitiveScreenshotsAllowed: true,
              }),
              ["free", "never", "never", "never", "ask"],
            );
          }
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
          for (const sensitiveScreenshotsAllowed of [false, true]) {
            assertEquals(
              rules(url, { ...flags, sensitiveScreenshotsAllowed }),
              Array(5).fill("never"),
            );
          }
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
        addedActNeverHosts: [],
        sensitivePage: false,
        sensitiveScreenshotsAllowed: true,
      }),
      "never",
    );
  });

  await t.step(
    "a tenant's added host joins the floor, with or without a wildcard",
    () => {
      for (const entry of ["example.com", "*.shop.example.com"]) {
        const step = {
          url: ORDINARY,
          trusted: true,
          tainted: false,
          origins: NO_ORIGINS,
          addedActNeverHosts: [entry],
          sensitivePage: false,
        };

        for (const [sensitiveScreenshotsAllowed, screenshot] of [
          [false, "never"],
          [true, "ask"],
        ] as const) {
          assertEquals(
            DEVICE_TOOL_NAMES.map((tool) =>
              deviceCardRule({ ...step, tool, sensitiveScreenshotsAllowed }),
            ),
            ["free", "never", "never", "never", screenshot],
            entry,
          );
        }
      }
    },
  );

  await t.step("a configuration that names no host refuses loudly", () => {
    const step = {
      tool: "browser_read_page",
      url: ORDINARY,
      trusted: false,
      tainted: false,
      origins: NO_ORIGINS,
      addedActNeverHosts: [],
      sensitivePage: false,
      sensitiveScreenshotsAllowed: false,
    } as const;

    assertThrows(
      () => deviceCardRule({ ...step, addedActNeverHosts: ["not a host"] }),
      TypeError,
    );
    assertThrows(
      () =>
        deviceCardRule({
          ...step,
          origins: { appOrigins: ["aios.co.il"], backendOrigins: [] },
        }),
      TypeError,
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
