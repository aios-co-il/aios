import { assertStrictEquals } from "jsr:@std/assert@1";
import { goalResultCount } from "./outcomes.ts";

Deno.test("goalResultCount counts what the report shows", async (t) => {
  await t.step(
    "a sales campaign counts purchases; Google's are conversions",
    () => {
      assertStrictEquals(
        goalResultCount({ purchases: 2, leads: 5 }, "ecommerce"),
        2,
      );
      assertStrictEquals(
        goalResultCount(
          { conversions: 2, conversions_value: 600 },
          "ecommerce",
        ),
        2,
      );
    },
  );

  await t.step("a lead campaign counts leads, and 0 leads is a real 0", () => {
    assertStrictEquals(
      goalResultCount({ leads: 0, conversations: 0 }, "leads"),
      0,
    );
    assertStrictEquals(
      goalResultCount({ form_leads: 3, leads: 0 }, "leads"),
      3,
    );
    assertStrictEquals(goalResultCount({ conversations: 4 }, "leads"), 4);
  });

  await t.step("a traffic campaign has no result count", () => {
    assertStrictEquals(
      goalResultCount({ conversations: 0, lp_or_form_views: 160 }, "traffic"),
      null,
    );
  });
});
