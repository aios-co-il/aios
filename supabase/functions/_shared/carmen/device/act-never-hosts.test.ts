import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "jsr:@std/assert@1";
import {
  ACT_NEVER_HOSTS,
  ACT_NEVER_TOP_LEVEL_DOMAINS,
  isActNeverHost,
} from "./act-never-hosts.ts";

const FLOOR = [
  ...Object.values(ACT_NEVER_HOSTS).flat(),
  ...ACT_NEVER_TOP_LEVEL_DOMAINS,
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

  await t.step("every entry and a subdomain of it are on the floor", () => {
    for (const host of Object.values(ACT_NEVER_HOSTS).flat()) {
      assertStrictEquals(isActNeverHost(`https://${host}/`, []), true, host);
      assertStrictEquals(isActNeverHost(`https://x.${host}/a`, []), true, host);
    }
  });

  await t.step("the four kinds, and nothing else", () => {
    assertEquals(Object.keys(ACT_NEVER_HOSTS), [
      "mail",
      "messaging",
      "bank",
      "payment",
    ]);
  });
});

Deno.test("act floor: matching", async (t) => {
  const cases: Array<[string, boolean]> = [
    ["https://mail.google.com/mail/u/0/", true],
    ["https://outlook.live.com/mail/", true],
    ["https://outlook.cloud.microsoft/mail/", true],
    ["https://mail.proton.me/", true],
    ["https://mail.yandex.ru/", true],
    ["https://web.whatsapp.com/", true],
    ["https://api.whatsapp.com/send?phone=972500000000", true],
    ["https://wa.me/972500000000", true],
    ["https://app.slack.com/client", true],
    ["https://teams.cloud.microsoft/", true],
    ["https://voice.google.com/u/0/messages", true],
    ["https://login.bankhapoalim.co.il/", true],
    ["https://hb2.bankleumi.co.il/", true],
    ["https://start.telebank.co.il/", true],
    ["https://www.bankotsar.co.il/", true],
    ["https://www.pagi.co.il/", true],
    ["https://www.u-bank.net/", true],
    ["https://digital.isracard.co.il/", true],
    ["https://www.americanexpress.com/", true],
    ["https://online.firstnational.bank/", true],
    ["https://www.paypal.com/", true],
    ["https://dashboard.stripe.com/", true],
    ["https://www.bitpay.co.il/", true],
    ["https://secure.cardcom.solutions/", true],
    ["https://outlook.com/mail/", true],
    ["https://mail.zoho.eu/", true],
    ["https://app.tutanota.com/", true],
    ["https://www.gmx.de/", true],
    ["https://t.me/someone", true],
    ["https://discordapp.com/channels/@me", true],
    ["https://www.paypal.me/someone", true],
    ["https://transferwise.com/", true],
    ["https://www.cardcom.co.il/", true],
    ["https://gateway20.pelecard.biz/", true],
    // Other spellings of a host on the floor.
    ["https://www.paypal.com./", true],
    ["HTTPS://WWW.PAYPAL.COM/", true],
    ["https://a.BANK./", true],
    ["http://paypal.com:8443/", true],
    // Only the mail and payment hosts of a wider site.
    ["https://google.com/", false],
    ["https://docs.google.com/", false],
    ["https://www.microsoft.com/", false],
    ["https://word.cloud.microsoft/", false],
    // Look-alikes.
    ["https://paypal.com.evil.example/", false],
    ["https://notpaypal.com/", false],
    ["https://paypal.co/", false],
    ["https://mail.google.com.evil.example/", false],
    ["https://xn--pypal-4ve.com/", false],
    ["https://firstnationalbank/", false],
    ["https://bank.example/", false],
    ["https://evil.example/paypal.com", false],
    ["https://example.com/", false],
  ];

  for (const [url, expected] of cases) {
    await t.step(url, () => {
      assertStrictEquals(isActNeverHost(url, []), expected);
    });
  }

  await t.step("what is not a web address counts as on the floor", () => {
    for (const url of ["", "paypal.com", "example.com", "chrome://settings"]) {
      assertStrictEquals(isActNeverHost(url, []), true, url);
    }
  });
});

Deno.test("act floor: a tenant can only add", async (t) => {
  await t.step("an added host and its subdomains are refused", () => {
    for (const entry of [
      "crm.example.com",
      " CRM.Example.com. ",
      "*.crm.example.com",
      ".crm.example.com",
    ]) {
      assertEquals(
        ["crm.example.com", "eu.crm.example.com", "example.com"].map((host) =>
          isActNeverHost(`https://${host}/`, [entry]),
        ),
        [true, true, false],
        entry,
      );
    }
  });

  await t.step("an entry pasted as an address is read as its host", () => {
    for (const entry of [
      "https://crm.example.com",
      "https://crm.example.com/deals?id=1#top",
      "http://CRM.example.com:8080/",
      "crm.example.com/",
      "crm.example.com/deals",
      "crm.example.com:8443",
    ]) {
      assertEquals(
        ["crm.example.com", "eu.crm.example.com", "example.com"].map((host) =>
          isActNeverHost(`https://${host}/`, [entry]),
        ),
        [true, true, false],
        entry,
      );
    }
  });

  await t.step("an internationalised entry matches the tab's punycode", () => {
    assertStrictEquals(
      isActNeverHost("https://בנק.example/", ["בנק.example"]),
      true,
    );
  });

  await t.step("a blank entry names nothing", () => {
    for (const added of [[], [""], ["  ", "*", ".", "*."]]) {
      assertStrictEquals(isActNeverHost("https://example.com/", added), false);
    }
  });

  await t.step("an entry that names no host throws", () => {
    for (const entry of [
      "foo bar",
      "https://",
      "mailto:someone",
      "a b.com/x",
    ]) {
      assertThrows(
        () => isActNeverHost("https://example.com/", [entry]),
        TypeError,
        "Act-floor entry",
        entry,
      );
      // Also for an address that is refused anyway: the misconfiguration is never quiet.
      assertThrows(() => isActNeverHost("", [entry]), TypeError);
    }
  });

  await t.step("no entry takes a host off the floor", () => {
    for (const added of [
      [],
      ["-paypal.com", "!paypal.com", "paypal.com"],
      ["www.paypal.com"],
    ]) {
      assertStrictEquals(
        isActNeverHost("https://www.paypal.com/", added),
        true,
      );
    }
  });
});
