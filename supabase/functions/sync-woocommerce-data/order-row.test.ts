import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { mapOrderRow } from "./order-row.ts";

const order = {
  id: 501,
  number: "1001",
  status: "completed",
  currency: "ILS",
  total: "120.50",
  subtotal: "100",
  total_tax: "20.50",
  shipping_total: "0.00",
  discount_total: "bad",
  customer_id: 0,
  billing: { email: "a@b.co", first_name: "Dana", phone: "050" },
  line_items: [{ id: 1 }],
  date_created: "2026-10-01T10:00:00",
  meta_data: [
    { key: "_wc_order_attribution_utm_source", value: "facebook" },
    { key: 7, value: "ignored" },
  ],
};

Deno.test("mapOrderRow maps the order columns", () => {
  const row = mapOrderRow("t1", "s1", order);
  assertStrictEquals(row.tenant_id, "t1");
  assertStrictEquals(row.site_id, "s1");
  assertStrictEquals(row.woo_order_id, 501);
  assertStrictEquals(row.order_number, "1001");
  assertStrictEquals(row.total, 120.5);
  assertStrictEquals(row.total_tax, 20.5);
  assertStrictEquals(row.discount_total, 0);
  assertStrictEquals(row.customer_id, null);
  assertStrictEquals(row.customer_email, "a@b.co");
  assertStrictEquals(row.customer_last_name, null);
  assertEquals(row.shipping, {});
  assertEquals(row.line_items, [{ id: 1 }]);
  assertStrictEquals(row.date_paid, null);
  assertStrictEquals(row.attribution?.utm_source, "facebook");
});

Deno.test("mapOrderRow falls back to the id and empty values", () => {
  const row = mapOrderRow("t1", "s1", { id: 9 });
  assertStrictEquals(row.order_number, "9");
  assertStrictEquals(row.total, 0);
  assertEquals(row.billing, {});
  assertEquals(row.line_items, []);
  assertStrictEquals(row.attribution, null);
});
