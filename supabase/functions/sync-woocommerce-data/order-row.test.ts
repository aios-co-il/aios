import assert from "node:assert/strict";
import { test } from "node:test";
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

test("mapOrderRow maps the order columns", () => {
  const row = mapOrderRow("t1", "s1", order);
  assert.equal(row.tenant_id, "t1");
  assert.equal(row.site_id, "s1");
  assert.equal(row.woo_order_id, 501);
  assert.equal(row.order_number, "1001");
  assert.equal(row.total, 120.5);
  assert.equal(row.total_tax, 20.5);
  assert.equal(row.discount_total, 0);
  assert.equal(row.customer_id, null);
  assert.equal(row.customer_email, "a@b.co");
  assert.equal(row.customer_last_name, null);
  assert.deepEqual(row.shipping, {});
  assert.deepEqual(row.line_items, [{ id: 1 }]);
  assert.equal(row.date_paid, null);
  assert.equal(row.attribution?.utm_source, "facebook");
});

test("mapOrderRow falls back to the id and empty values", () => {
  const row = mapOrderRow("t1", "s1", { id: 9 });
  assert.equal(row.order_number, "9");
  assert.equal(row.total, 0);
  assert.deepEqual(row.billing, {});
  assert.deepEqual(row.line_items, []);
  assert.equal(row.attribution, null);
});
