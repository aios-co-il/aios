import assert from "node:assert/strict";
import test from "node:test";
import { fakeDb } from "./fake-db.ts";
import {
  addToBlacklist,
  blacklistRows,
  unsubscribeAddresses,
  unsubscribeUrl,
  whatsappUnsubscribeFooter,
} from "./blacklist.ts";

test("blacklistRows normalizes, de-duplicates and blocks on all channels", () => {
  const rows = blacklistRows(
    "t1",
    {
      phones: ["050-123-4567", "972501234567", null, ""],
      emails: [" Dana@Example.com ", "dana@example.com", "not-an-email", null],
    },
    "unsubscribe_link",
  );
  assert.deepEqual(rows, [
    {
      tenant_id: "t1",
      phone: "972501234567",
      email: null,
      channel: "all",
      source: "unsubscribe_link",
    },
    {
      tenant_id: "t1",
      phone: null,
      email: "dana@example.com",
      channel: "all",
      source: "unsubscribe_link",
    },
  ]);
});

test("addToBlacklist inserts one row per address", async () => {
  const { db, writes } = fakeDb({});
  const n = await addToBlacklist(
    db,
    "t1",
    { phones: ["0501234567"], emails: ["a@b.co"] },
    "manual",
  );
  assert.equal(n, 2);
  assert.equal(writes.length, 2);
  assert.ok(writes.every((w) => w.table === "broadcast_opt_outs"));
});

test("unsubscribe link and WhatsApp footer", () => {
  const url = unsubscribeUrl("https://x.supabase.co", "r1");
  assert.equal(
    url,
    "https://x.supabase.co/functions/v1/broadcast-unsubscribe?r=r1",
  );
  assert.equal(
    whatsappUnsubscribeFooter(url),
    `\n\nלהסרה מרשימת הדיוור: ${url}`,
  );
});

test("unsubscribeAddresses recovers the snapshot phone of an email recipient", () => {
  const a = unsubscribeAddresses(
    {
      entity_type: "manual",
      phone: null,
      email: "dana@example.com",
      vars: { phone: "050-123-4567", email: "dana@example.com" },
    },
    null,
  );
  const rows = blacklistRows("t1", a, "unsubscribe_link");
  assert.deepEqual(
    rows.map((r) => r.phone ?? r.email),
    ["972501234567", "dana@example.com"],
  );
});

test("unsubscribeAddresses adds the CRM record's current phone and email", () => {
  const a = unsubscribeAddresses(
    { entity_type: "lead", phone: "0501111111", email: null, vars: {} },
    { phone: "0502222222", email: "lead@example.com" },
  );
  const rows = blacklistRows("t1", a, "unsubscribe_link");
  assert.deepEqual(
    rows.map((r) => r.phone ?? r.email),
    ["972501111111", "972502222222", "lead@example.com"],
  );
});

test("unsubscribeAddresses never blocks a WhatsApp group chat id", () => {
  const a = unsubscribeAddresses(
    {
      entity_type: "wa_group",
      phone: "120363416882903532@g.us",
      email: null,
      vars: null,
    },
    null,
  );
  assert.deepEqual(a.phones, []);
});
