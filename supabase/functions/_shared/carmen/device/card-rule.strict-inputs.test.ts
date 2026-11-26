import { assertStrictEquals, assertThrows } from "jsr:@std/assert@1";
import { deviceCardRule, type DeviceStep } from "./card-rule.ts";
import { NO_ORIGINS } from "./never-controllable.test-fixture.ts";

const ORDINARY = "https://shop.example.com/cart";
const MAIL = "https://mail.google.com/mail/u/0/";
const AIOS = "https://staging.aios.co.il/clients";

/** Everything set so that a click is free and a picture is free: any drift shows. */
const LOOSEST_STEP = {
  url: ORDINARY,
  trusted: true,
  tainted: false,
  origins: NO_ORIGINS,
  addedActNeverHosts: [],
  sensitivePage: false,
  sensitiveScreenshotsAllowed: false,
};

/**
 * A step as a caller no type check guards builds it (CI runs edge tests with `--no-check`):
 * through JSON, where a field can be missing, null or a string.
 */
function uncheckedStep(fields: Record<string, unknown>): DeviceStep {
  return JSON.parse(JSON.stringify({ ...LOOSEST_STEP, ...fields }));
}

/** What an unchecked caller may hold where a boolean belongs; `undefined` is a missing field. */
const NOT_BOOLEANS = [undefined, null, "true", "false", "", 0, 1, {}];

Deno.test(
  "deviceCardRule: a value that is not a real boolean tightens",
  async (t) => {
    await t.step(
      "the loosest step is free, so the cases below prove a change",
      () => {
        for (const tool of [
          "browser_click",
          "browser_type",
          "browser_screenshot",
        ]) {
          assertStrictEquals(
            deviceCardRule(uncheckedStep({ tool })),
            "free",
            tool,
          );
        }
      },
    );

    for (const field of ["trusted", "tainted", "sensitivePage"]) {
      await t.step(`${field}: clicking and typing ask`, () => {
        for (const value of NOT_BOOLEANS) {
          for (const tool of ["browser_click", "browser_type"]) {
            assertStrictEquals(
              deviceCardRule(uncheckedStep({ tool, [field]: value })),
              "ask",
              `${tool} ${JSON.stringify(value)}`,
            );
          }
        }
      });
    }

    await t.step("sensitivePage: a picture is refused", () => {
      for (const sensitivePage of NOT_BOOLEANS) {
        assertStrictEquals(
          deviceCardRule(
            uncheckedStep({ tool: "browser_screenshot", sensitivePage }),
          ),
          "never",
          JSON.stringify(sensitivePage),
        );
      }
    });

    await t.step(
      "sensitiveScreenshotsAllowed: a picture of a sensitive or act-floor page is refused",
      () => {
        for (const sensitiveScreenshotsAllowed of NOT_BOOLEANS) {
          for (const page of [{ sensitivePage: true }, { url: MAIL }]) {
            assertStrictEquals(
              deviceCardRule(
                uncheckedStep({
                  tool: "browser_screenshot",
                  sensitiveScreenshotsAllowed,
                  ...page,
                }),
              ),
              "never",
              JSON.stringify(sensitiveScreenshotsAllowed),
            );
          }
        }
      },
    );

    await t.step("a tool the table does not hold throws", () => {
      for (const tool of [
        "toString",
        "constructor",
        "",
        "send_message",
        7,
        null,
        undefined,
      ]) {
        for (const url of [ORDINARY, MAIL, AIOS]) {
          assertThrows(
            () => deviceCardRule(uncheckedStep({ tool, url })),
            TypeError,
            "Not a device tool",
            `${JSON.stringify(tool)} ${url}`,
          );
        }
      }
    });
  },
);
