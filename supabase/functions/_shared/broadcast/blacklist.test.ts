import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { fakeDb } from "./fake-db.ts";
import {
  addToBlacklist,
  blacklistRows,
  unsubscribeAddresses,
  unsubscribeUrl,
  whatsappUnsubscribeFooter,
} from "./blacklist.ts";

Deno.test(
  "blacklistRows normalizes, de-duplicates and blocks on all channels",
  () => {
    const rows = blacklistRows(
      "t1",
      {
        phones: ["050-123-4567", "972501234567", null, ""],
        emails: [
          " Dana@Example.com ",
          "dana@example.com",
          "not-an-email",
          null,
        ],
      },
      "unsubscribe_link",
    );
    assertEquals(rows, [
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
  },
);

Deno.test("addToBlacklist inserts one row per address", async () => {
  const { db, writes } = fakeDb({});
  const n = await addToBlacklist(
    db,
    "t1",
    { phones: ["0501234567"], emails: ["a@b.co"] },
    "manual",
  );
  assertStrictEquals(n, 2);
  assertStrictEquals(writes.length, 2);
  assert(writes.every((w) => w.table === "broadcast_opt_outs"));
});

Deno.test("unsubscribe link and WhatsApp footer", () => {
  const url = unsubscribeUrl("https://x.supabase.co", "r1");
  assertStrictEquals(
    url,
    "https://x.supabase.co/functions/v1/broadcast-unsubscribe?r=r1",
  );
  assertStrictEquals(
    whatsappUnsubscribeFooter(url),
    `\n\nלהסרה מרשימת הדיוור: ${url}`,
  );
});

Deno.test(
  "unsubscribeAddresses recovers the snapshot phone of an email recipient",
  () => {
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
    assertEquals(
      rows.map((r) => r.phone ?? r.email),
      ["972501234567", "dana@example.com"],
    );
  },
);

Deno.test(
  "unsubscribeAddresses adds the CRM record's current phone and email",
  () => {
    const a = unsubscribeAddresses(
      { entity_type: "lead", phone: "0501111111", email: null, vars: {} },
      { phone: "0502222222", email: "lead@example.com" },
    );
    const rows = blacklistRows("t1", a, "unsubscribe_link");
    assertEquals(
      rows.map((r) => r.phone ?? r.email),
      ["972501111111", "972502222222", "lead@example.com"],
    );
  },
);

Deno.test("unsubscribeAddresses never blocks a WhatsApp group chat id", () => {
  const a = unsubscribeAddresses(
    {
      entity_type: "wa_group",
      phone: "120363416882903532@g.us",
      email: null,
      vars: null,
    },
    null,
  );
  assertEquals(a.phones, []);
});
