import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  ACT_NEVER_HOSTS,
  ACT_NEVER_SUFFIXES,
  actNeverCategory,
} from "./act-never-hosts.ts";

const FLOOR = [
  ...Object.values(ACT_NEVER_HOSTS).flat(),
  ...ACT_NEVER_SUFFIXES.bank,
];

Deno.test("act floor: the list", async (t) => {
  await t.step("every entry is a bare lower-case host, listed once", () => {
    for (const host of FLOOR) {
      assertStrictEquals(
        /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/.test(host),
        true,
        host,
      );
    }
    assertStrictEquals(new Set(FLOOR).size, FLOOR.length);
  });

  await t.step("every entry is on the floor, under its own category", () => {
    for (const [category, hosts] of Object.entries(ACT_NEVER_HOSTS)) {
      for (const host of hosts) {
        assertStrictEquals(actNeverCategory(host), category, host);
      }
    }
  });
});

Deno.test("act floor: matching", async (t) => {
  const cases: Array<[string, string | null]> = [
    ["mail.google.com", "mail"],
    ["outlook.live.com", "mail"],
    ["mail.proton.me", "mail"],
    ["web.whatsapp.com", "messaging"],
    ["app.slack.com", "messaging"],
    ["login.bankhapoalim.co.il", "bank"],
    ["hb2.bankleumi.co.il", "bank"],
    ["start.telebank.co.il", "bank"],
    ["digital.isracard.co.il", "bank"],
    ["online.firstnational.bank", "bank"],
    ["www.paypal.com", "payment"],
    ["dashboard.stripe.com", "payment"],
    ["checkout.stripe.com", "payment"],
    ["www.bitpay.co.il", "payment"],
    ["secure.cardcom.solutions", "payment"],
    // Only the mail and payment hosts of a wider site.
    ["google.com", null],
    ["docs.google.com", null],
    ["www.microsoft.com", null],
    ["whatsapp.com", null],
    // Look-alikes.
    ["paypal.com.evil.example", null],
    ["notpaypal.com", null],
    ["paypal.co", null],
    ["mail.google.com.evil.example", null],
    ["xn--pypal-4ve.com", null],
    ["firstnationalbank", null],
    ["bank.example", null],
    ["example.com", null],
    ["", null],
  ];

  for (const [hostname, category] of cases) {
    await t.step(hostname || "(empty)", () => {
      assertStrictEquals(actNeverCategory(hostname), category);
    });
  }
});

Deno.test("act floor: a tenant can only add", async (t) => {
  await t.step("an added host and its subdomains are refused", () => {
    for (const entry of [
      "crm.example.com",
      " CRM.Example.com. ",
      "*.crm.example.com",
    ]) {
      assertEquals(
        ["crm.example.com", "eu.crm.example.com", "example.com"].map((host) =>
          actNeverCategory(host, [entry]),
        ),
        ["tenant_added", "tenant_added", null],
        entry,
      );
    }
  });

  await t.step("no entry takes a host off the floor", () => {
    for (const added of [
      [],
      [""],
      ["  ", "*", ".", "*."],
      ["-paypal.com", "!paypal.com", "paypal.com"],
    ]) {
      assertStrictEquals(actNeverCategory("www.paypal.com", added), "payment");
      assertStrictEquals(actNeverCategory("example.com", added), null);
    }
  });
});
