/**
 * The act floor: sites where Carmen may read the page and never navigates, clicks or types,
 * because one action there sends from a personal account or moves money.
 *
 * This list is code and not a setting on purpose (a departure from the work standard's
 * "configuration over hard-coding", approved with AIO-656 decision 4): a setting someone
 * can empty is not a safety floor. A tenant setting may only add hosts, through
 * `addedHosts` below; nothing a caller passes can take a host off the floor. Adding to the
 * floor is a reviewed change to this file, and the owner of the list is the product owner.
 */
import { isHostWithinAny } from "./never-controllable.ts";

/**
 * Each entry covers the host and its subdomains. An entry is the registrable domain when
 * the whole site is the service, and one host when only that host is (Google and Microsoft
 * serve mail next to unrelated products).
 */
export const ACT_NEVER_HOSTS = {
  mail: [
    "mail.google.com",
    "outlook.live.com",
    "outlook.office.com",
    "outlook.office365.com",
    "mail.yahoo.com",
    "mail.aol.com",
    "icloud.com",
    "proton.me",
    "protonmail.com",
    "mail.zoho.com",
    "fastmail.com",
    "tuta.com",
    "hey.com",
    "gmx.com",
    "gmx.net",
    "mail.yandex.com",
    "mail.walla.co.il",
  ],
  messaging: [
    "web.whatsapp.com",
    "web.telegram.org",
    "messenger.com",
    "messages.google.com",
    "chat.google.com",
    "teams.microsoft.com",
    "teams.live.com",
    "slack.com",
    "discord.com",
    "web.skype.com",
  ],
  bank: [
    "bankhapoalim.co.il",
    "leumi.co.il",
    "bankleumi.co.il",
    "discountbank.co.il",
    "telebank.co.il",
    "mizrahi-tefahot.co.il",
    "fibi.co.il",
    "bank-yahav.co.il",
    "mercantile.co.il",
    "bankjerusalem.co.il",
    "bankmassad.co.il",
    "onezerobank.com",
    "pepper.co.il",
    "isracard.co.il",
    "max.co.il",
    "cal-online.co.il",
    "americanexpress.co.il",
  ],
  payment: [
    "paypal.com",
    "stripe.com",
    "wise.com",
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
    "payplus.co.il",
    "meshulam.co.il",
    "pelecard.com",
    "z-credit.com",
  ],
} as const satisfies Record<string, ReadonlyArray<string>>;

/** Top-level domains only a regulated bank can register, so every host under them is one. */
export const ACT_NEVER_SUFFIXES = { bank: ["bank"] } as const;

/** Why acting on a host is refused: its category on the floor, or the tenant's own addition. */
export type ActNeverCategory = keyof typeof ACT_NEVER_HOSTS | "tenant_added";

/**
 * The category that puts a host on the act floor, or null when acting may be considered.
 * `addedHosts` is the tenant's setting: each entry adds a host and its subdomains.
 */
export function actNeverCategory(
  hostname: string,
  addedHosts: ReadonlyArray<string> = [],
): ActNeverCategory | null {
  for (const category of FLOOR_CATEGORIES) {
    if (isHostWithinAny(hostname, ACT_NEVER_HOSTS[category])) {
      return category;
    }
  }
  if (isHostWithinAny(hostname, ACT_NEVER_SUFFIXES.bank)) {
    return "bank";
  }

  const added = addedHosts.map(addedDomain).filter(Boolean);

  return isHostWithinAny(hostname, added) ? "tenant_added" : null;
}

const FLOOR_CATEGORIES = Object.keys(ACT_NEVER_HOSTS).filter(isFloorCategory);

/** Narrows a key of the floor to its category. */
function isFloorCategory(key: string): key is keyof typeof ACT_NEVER_HOSTS {
  return Object.prototype.hasOwnProperty.call(ACT_NEVER_HOSTS, key);
}

/** A tenant's entry as a domain: trimmed, lower-cased, without a `*.` or stray dots; "" names nothing. */
function addedDomain(entry: string): string {
  return entry
    .trim()
    .toLowerCase()
    .replace(/^\*?\.+|\.+$/g, "");
}
