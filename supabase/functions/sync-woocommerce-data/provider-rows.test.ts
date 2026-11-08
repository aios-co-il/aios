import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { mapProductRow } from "./product-row.ts";
import { mapCustomerRow } from "./customer-row.ts";
Deno.test(
  "WooCommerce validates product and customer database scalar fields",
  () => {
    assertEquals(
      mapProductRow("tenant", "site", {
        id: 1,
        name: "Shoes",
        price: "19.5",
        categories: [{ id: 2 }],
      }).price,
      19.5,
    );
    assertEquals(
      mapCustomerRow("tenant", "site", {
        id: 1,
        email: "a@example.com",
        total_spent: "12",
      }).total_spent,
      12,
    );
    assertThrows(() =>
      mapProductRow("tenant", "site", { id: 1, price: { value: 19 } }),
    );
    assertThrows(() =>
      mapCustomerRow("tenant", "site", {
        id: 1,
        email: { value: "a@example.com" },
      }),
    );
    assertThrows(() => mapProductRow("tenant", "site", { id: "bad" }));
  },
);
