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
