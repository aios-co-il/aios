/**
 * The act floor: sites where Carmen may read the page's text and never navigates, clicks,
 * types or takes a picture, because one action there sends from a personal account or moves
 * money, and a picture of the page would go to an outside vision model.
 *
 * This list is code and not a setting on purpose (a departure from the work standard's
 * "configuration over hard-coding", approved with AIO-656 decision 4): a setting someone
 * can empty is not a safety floor. A tenant setting may only add hosts, through
 * `addedHosts` below; nothing a caller passes can take a host off the floor. Adding to the
 * floor is a reviewed change to this file, and the owner of the list is the product owner.
 */
import {
  isHostWithinAny,
  parseWebAddress,
  webHostname,
} from "./never-controllable.ts";

/**
 * Each entry covers the host and its subdomains. An entry is the registrable domain when
 * the whole site is the service, and one host when only that host is (Google and Microsoft
 * serve mail next to unrelated products).
 */
export const ACT_NEVER_HOSTS = {
  mail: [
    "mail.google.com",
    "outlook.com",
    "outlook.live.com",
    "outlook.office.com",
    "outlook.office365.com",
    "outlook.cloud.microsoft",
    "mail.yahoo.com",
    "mail.aol.com",
    "icloud.com",
    "proton.me",
    "protonmail.com",
    "mail.zoho.com",
    "mail.zoho.eu",
    "fastmail.com",
    "tuta.com",
    "tutanota.com",
    "hey.com",
    "gmx.com",
    "gmx.net",
    "gmx.de",
    "mail.yandex.com",
    "mail.yandex.ru",
    "mail.walla.co.il",
  ],
  messaging: [
    // The whole site and its link shortener: the "send to this number" links live there.
    "whatsapp.com",
    "wa.me",
    "web.telegram.org",
    "t.me",
    "messenger.com",
    "messages.google.com",
    "chat.google.com",
    "voice.google.com",
    "teams.microsoft.com",
    "teams.live.com",
    "teams.cloud.microsoft",
    "slack.com",
    "discord.com",
    "discordapp.com",
    "web.skype.com",
  ],
  // Israeli banks and card companies; banks elsewhere are covered by the `.bank` rule only.
  bank: [
    "bankhapoalim.co.il",
    "leumi.co.il",
    "bankleumi.co.il",
    "discountbank.co.il",
    "telebank.co.il",
    "mizrahi-tefahot.co.il",
    "fibi.co.il",
    "bankotsar.co.il",
    "pagi.co.il",
    "u-bank.net",
    "bankmassad.co.il",
    "bank-yahav.co.il",
    "mercantile.co.il",
    "bankjerusalem.co.il",
    "onezerobank.com",
    "pepper.co.il",
    "isracard.co.il",
    "max.co.il",
    "cal-online.co.il",
    "americanexpress.co.il",
    "americanexpress.com",
  ],
  payment: [
    "paypal.com",
    "paypal.me",
    "stripe.com",
    "wise.com",
    "transferwise.com",
    "revolut.com",
    "payoneer.com",
    "venmo.com",
    "cash.app",
    "squareup.com",
    "skrill.com",
    "pay.google.com",
    "payments.google.com",
    "wallet.google.com",
    "pay.amazon.com",
    "coinbase.com",
    "binance.com",
    "kraken.com",
    "bitpay.co.il",
    "payboxapp.com",
    "tranzila.com",
    "cardcom.solutions",
    "cardcom.co.il",
    "payplus.co.il",
    "meshulam.co.il",
    "pelecard.com",
    "pelecard.biz",
    "z-credit.com",
  ],
} as const satisfies Record<string, ReadonlyArray<string>>;

/** Top-level domains only a regulated bank can register, so every host under them is one. */
export const ACT_NEVER_TOP_LEVEL_DOMAINS = ["bank"] as const;

/**
 * Whether an address is on the act floor. It takes the address and not a host so that
 * every caller gets the same normalising (case, trailing dots, punycode); an address that
 * is not a web page counts as on the floor, because nothing may act on what cannot be read.
 * `addedHosts` is the tenant's setting: each entry adds a host and its subdomains, and none
 * can take a host off. An entry that names no host throws, so a protection the tenant
 * believes in is never dropped quietly; whoever saves the setting validates with the same
 * call.
 */
export function isActNeverHost(
  url: string,
  addedHosts: ReadonlyArray<string>,
): boolean {
  const added = addedHosts.flatMap(addedDomain);
  const address = parseWebAddress(url);

  if (!address) {
    return true;
  }
  const hostname = webHostname(address);

  return (
    isHostWithinAny(hostname, FLOOR_HOSTS) ||
    isHostWithinAny(hostname, ACT_NEVER_TOP_LEVEL_DOMAINS) ||
    isHostWithinAny(hostname, added)
  );
}

const FLOOR_HOSTS: ReadonlyArray<string> =
  Object.values(ACT_NEVER_HOSTS).flat();

/** Whether an entry already says how it is reached, as a pasted address does. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * The host a tenant's entry names, as a list of one; a blank entry names none. A bare
 * domain, a `*.domain` and an address pasted from the browser all read as the same host.
 */
function addedDomain(entry: string): Array<string> {
  const domain = entry.trim().replace(/^\*?\.*/, "");

  if (!domain) {
    return [];
  }
  const address = HAS_SCHEME.test(domain) ? domain : `https://${domain}`;
  const hostname = URL.canParse(address) ? webHostname(new URL(address)) : "";

  if (!hostname) {
    throw new TypeError(
      `Act-floor entry is not a host or an address: ${JSON.stringify(entry)}`,
    );
  }
  return [hostname];
}
