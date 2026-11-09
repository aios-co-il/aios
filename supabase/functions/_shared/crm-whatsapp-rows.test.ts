import { assertEquals } from "jsr:@std/assert@1";
import { integrationRows } from "./crm-whatsapp-rows.ts";

Deno.test(
  "integrationRows keeps rows with a non-empty string id and type",
  () => {
    assertEquals(
      integrationRows([
        { id: "i1", integration_type: "green_api", user_id: "u1" },
        { id: "i2", integration_type: "meta_whatsapp", user_id: 5 },
        { id: "", integration_type: "green_api" },
        { id: 3, integration_type: "green_api" },
        { id: "i4" },
        null,
      ]),
      [
        { id: "i1", integration_type: "green_api", user_id: "u1" },
        { id: "i2", integration_type: "meta_whatsapp", user_id: null },
      ],
    );
  },
);

Deno.test("integrationRows reads anything but a list as no rows", () => {
  assertEquals(integrationRows({ id: "i1" }), []);
  assertEquals(integrationRows(null), []);
});
