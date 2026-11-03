import { assertEquals } from "jsr:@std/assert@1";
import { resolveCarmenIdentityPhone } from "./identity-phone.ts";
import { fakeTables } from "./test-tables.ts";

const LID = "224686986293269";

Deno.test("resolveCarmenIdentityPhone", async (t) => {
  await t.step("keeps a real phone without reading the LID map", async () => {
    const sb = fakeTables({});
    assertEquals(
      await resolveCarmenIdentityPhone(sb, "+972-50-123-4567"),
      "972501234567",
    );
    assertEquals(sb.queried, []);
  });

  await t.step("resolves a known LID to its mapped phone", async () => {
    const sb = fakeTables({
      wa_lid_map: [{ lid: LID, phone: "972501234567" }],
    });
    assertEquals(await resolveCarmenIdentityPhone(sb, LID), "972501234567");
  });

  await t.step(
    "never treats an unknown LID with a mobile-looking tail as a phone",
    async () => {
      const sb = fakeTables({});
      assertEquals(await resolveCarmenIdentityPhone(sb, LID), "");
      assertEquals(sb.queried, ["wa_lid_map"]);
    },
  );

  await t.step("ignores a map row whose phone is itself a LID", async () => {
    const sb = fakeTables({
      wa_lid_map: [{ lid: LID, phone: "135790246813579" }],
    });
    assertEquals(await resolveCarmenIdentityPhone(sb, LID), "");
  });

  await t.step(
    "logs a failed LID lookup and leaves the author unresolved",
    async () => {
      const logged: Array<Array<unknown>> = [];
      const originalError = console.error;
      console.error = (...args: Array<unknown>) => {
        logged.push(args);
      };
      try {
        assertEquals(
          await resolveCarmenIdentityPhone(failingLidMap(), LID),
          "",
        );
      } finally {
        console.error = originalError;
      }
      assertEquals(logged.length, 1);
      assertEquals(logged[0][1], { lid: LID, error: "lookup failed" });
    },
  );

  await t.step("keeps a foreign phone the map does not know", async () => {
    const sb = fakeTables({});
    assertEquals(
      await resolveCarmenIdentityPhone(sb, "14155551234"),
      "14155551234",
    );
  });

  await t.step("returns empty for an empty author", async () => {
    assertEquals(await resolveCarmenIdentityPhone(fakeTables({}), ""), "");
  });
});

/** A LID map whose lookup returns an error, as a failed PostgREST read does. */
function failingLidMap() {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({
      data: null,
      error: { message: "lookup failed" },
    }),
  };
  return { from: () => query };
}
