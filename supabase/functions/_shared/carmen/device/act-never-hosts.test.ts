import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "jsr:@std/assert@1";
import {
  ACT_NEVER_HOSTS,
  ACT_NEVER_TOP_LEVEL_DOMAINS,
  isActNeverHost,
  PLAIN_HOST,
} from "./act-never-hosts.ts";

const FLOOR = [
  ...Object.values(ACT_NEVER_HOSTS).flat(),
  ...ACT_NEVER_TOP_LEVEL_DOMAINS,
];

Deno.test("act floor: the list", async (t) => {
  await t.step("every entry is a bare lower-case host, listed once", () => {
    for (const host of FLOOR) {
      assertStrictEquals(PLAIN_HOST.test(host), true, host);
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

  await t.step("an internationalised entry matches the tab's punycode", () => {
    assertStrictEquals(
      isActNeverHost("https://בנק.example/", ["בנק.example"]),
      true,
    );
  });

  await t.step("a blank entry names nothing", () => {
    for (const added of [[], [""], ["  ", "\t"]]) {
      assertStrictEquals(isActNeverHost("https://example.com/", added), false);
    }
  });

  await t.step("an entry that names no host throws", () => {
    for (const entry of [
      "foo bar",
      "https://",
      "mailto:someone",
      "a b.com/x",
      "*",
      ".",
      "*.",
      "...",
      "localhost",
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

  await t.step("an entry that is not one plain host throws", () => {
    for (const entry of [
      "foo.com,bar.com",
      "foo.com, bar.com",
      "foo.com;bar.com",
      "foo.com\nbar.com",
      "foo.com\r\nbar.com",
      "foo.com\tbar.com",
      "'foo.com'",
      '"foo.com"',
      "*.*.foo.com",
      "foo.*",
      "foo.com*",
      "https://foo.com,bar.com/path",
      // An address is not a domain: its path, port or scheme typo could hide a second host.
      "https://crm.example.com",
      "crm.example.com/deals",
      "crm.example.com:8443",
      "https:/foo.com",
      "https//foo.com",
      "foo.com/bar.com",
      "foo.com\\bar.com",
      "foo.com?bar.com",
      "foo.com#bar.com",
      "foo.com@bar.com",
      // Punctuation that punycode would turn into letters of a host no tab can have.
      "\u201cfoo.com\u201d",
      "\u2018foo.com\u2019",
      "\u00abfoo.com\u00bb",
      "foo.com\u3001bar.com",
      "foo.com\u060cbar.com",
      "foo.com\u30fbbar.com",
      "foo.com\u2013bar.com",
      "foo.com\u2014bar.com",
      // No spelling removes a host: this one is refused, not read as "all but".
      "!paypal.com",
    ]) {
      assertThrows(
        () => isActNeverHost("https://example.com/", [entry]),
        TypeError,
        "Act-floor entry",
        entry,
      );
    }
  });

  await t.step("no entry takes a host off the floor", () => {
    for (const added of [
      [],
      ["-paypal.com", "paypal.com"],
      ["www.paypal.com"],
    ]) {
      assertStrictEquals(
        isActNeverHost("https://www.paypal.com/", added),
        true,
      );
    }
  });
});
