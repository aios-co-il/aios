import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  inferLeadSource,
  LEAD_SOURCE_ALIASES,
  LEAD_SOURCE_KEY_LABELS,
  LEAD_SOURCE_KEYS,
  LEAD_SOURCE_WORDS,
  leadSourceMatches,
  leadSourceTagName,
} from "./source-key.ts";

const MIGRATIONS = new URL("../../../migrations/", import.meta.url);

/** Body of the newest migration's `create or replace function public.<name>(`. */
async function latestSqlFunction(name: string): Promise<string> {
  const files: string[] = [];
  for await (const entry of Deno.readDir(MIGRATIONS)) {
    if (entry.isFile && entry.name.endsWith(".sql")) {
      files.push(entry.name);
    }
  }
  const marker = `create or replace function public.${name}(`;
  for (const file of files.sort().reverse()) {
    const sql = await Deno.readTextFile(new URL(file, MIGRATIONS));
    const start = sql.toLowerCase().indexOf(marker);
    if (start >= 0) {
      return sql.slice(start, sql.indexOf("$$;", start));
    }
  }
  throw new Error(`no migration defines public.${name}`);
}

Deno.test("fixed keys map to themselves", () => {
  for (const key of LEAD_SOURCE_KEYS) {
    assertStrictEquals(inferLeadSource(key), key);
  }
});

Deno.test("sent spellings of Facebook all map to paid_ads", () => {
  for (const sent of ["FB", "fb", "Facebook", "Facebook Ads", "פייסבוק"]) {
    assertStrictEquals(inferLeadSource(sent), "paid_ads");
  }
});

Deno.test("the names the intake used to map keep their keys", () => {
  assertEquals(
    [
      "site",
      "Contact_Form",
      "recommendation",
      "social",
      "ads",
      "ממומן",
      "call",
      "phone_call",
      "דיוור",
      "webinar",
      "google_ads",
      "אתר",
      "ווטסאפ",
    ].map(inferLeadSource),
    [
      "website",
      "website",
      "referral",
      "social_media",
      "paid_ads",
      "paid_ads",
      "cold_call",
      "cold_call",
      "email_campaign",
      "event",
      "paid_ads",
      "website",
      "whatsapp",
    ],
  );
});

Deno.test("empty or unknown text is other", () => {
  for (const sent of [null, undefined, "", "  ", "make", "רימרקטינג קיץ"]) {
    assertStrictEquals(inferLeadSource(sent), "other");
  }
});

Deno.test("a configured source matches leads by key", () => {
  assertStrictEquals(leadSourceMatches("facebook", "FB"), true);
  assertStrictEquals(leadSourceMatches("facebook", "Facebook"), true);
  assertStrictEquals(leadSourceMatches("paid_ads", "Facebook Ads"), true);
  assertStrictEquals(leadSourceMatches("facebook", "website"), false);
});

Deno.test("other takes unknown text; unknown text takes only itself", () => {
  assertStrictEquals(leadSourceMatches("other", "Promo X"), true);
  assertStrictEquals(leadSourceMatches("other", ""), true);
  assertStrictEquals(leadSourceMatches("Promo X", "promo x"), true);
  assertStrictEquals(leadSourceMatches("Promo X", "Promo Y"), false);
  assertStrictEquals(leadSourceMatches("Promo X", "other"), false);
  assertStrictEquals(leadSourceMatches("other", "FB"), false);
});

Deno.test("origin tag is the key's label, or the text as sent", () => {
  assertStrictEquals(leadSourceTagName("Facebook Ads"), "FB");
  assertStrictEquals(leadSourceTagName("FB"), "FB");
  assertStrictEquals(leadSourceTagName("site"), "אתר");
  assertStrictEquals(leadSourceTagName(" Promo X "), "Promo X");
  assertStrictEquals(leadSourceTagName("other"), null);
  assertStrictEquals(leadSourceTagName("אחר"), null);
  assertStrictEquals(leadSourceTagName(""), null);
});

Deno.test("SQL lead_source_key uses the same aliases and words", async () => {
  const body = await latestSqlFunction("lead_source_key");
  const aliases = [...body.matchAll(/\('([^']+)', '([a-z_]+)'\)/g)].map(
    ([, alias, key]) => [alias, key],
  );
  assertEquals(
    aliases,
    LEAD_SOURCE_ALIASES.map(([alias, key]) => [alias, key]),
  );

  const words = [...body.matchAll(/\((\d+), '([a-z_]+)', '([^']+)'\)/g)].map(
    ([, rank, key, word]) => [Number(rank), key, word],
  );
  assertEquals(
    words,
    LEAD_SOURCE_WORDS.flatMap(([key, list], index) =>
      list.map((word) => [index + 1, key, word]),
    ),
  );
});

Deno.test("SQL lead_source_tag_name uses the same labels", async () => {
  const body = await latestSqlFunction("lead_source_tag_name");
  const labels = Object.fromEntries(
    [...body.matchAll(/when '([a-z_]+)' then '([^']+)'/g)].map(
      ([, key, label]) => [key, label],
    ),
  );
  const known = Object.fromEntries(
    Object.entries(LEAD_SOURCE_KEY_LABELS).filter(([key]) => key !== "other"),
  );
  assertEquals(labels, known);
});
