/**
 * Lead arrival source: the text is stored exactly as sent ("FB", "Facebook
 * Ads", …), and everything that compares a source (broadcast list rules,
 * origin tags, automation conditions, the lead forms) compares its fixed key.
 *
 * This file is the mapping's one home. Its SQL twin, public.lead_source_key,
 * is built from the same two lists; source-key.test.ts fails when the newest
 * migration that defines it differs from them.
 */

/** The fixed keys (the values of the old lead_source enum). */
export const LEAD_SOURCE_KEYS = [
  "website",
  "referral",
  "social_media",
  "paid_ads",
  "cold_call",
  "email_campaign",
  "event",
  "whatsapp",
  "other",
] as const;

export type LeadSourceKey = (typeof LEAD_SOURCE_KEYS)[number];

/**
 * Whole-value spellings, compared after `compactLeadSource`. The fixed keys
 * map to themselves; the rest are the names webhook-lead-intake used to map
 * before the source was kept as sent.
 */
export const LEAD_SOURCE_ALIASES: ReadonlyArray<
  readonly [alias: string, key: LeadSourceKey]
> = [
  ["website", "website"],
  ["referral", "referral"],
  ["socialmedia", "social_media"],
  ["paidads", "paid_ads"],
  ["coldcall", "cold_call"],
  ["emailcampaign", "email_campaign"],
  ["event", "event"],
  ["whatsapp", "whatsapp"],
  ["other", "other"],
  ["site", "website"],
  ["form", "website"],
  ["contactform", "website"],
  ["טופס", "website"],
  ["recommendation", "referral"],
  ["social", "social_media"],
  ["סושיאל", "social_media"],
  ["fb", "paid_ads"],
  ["ads", "paid_ads"],
  ["ממומן", "paid_ads"],
  ["phone", "cold_call"],
  ["call", "cold_call"],
  ["phonecall", "cold_call"],
  ["דיוור", "email_campaign"],
  ["webinar", "event"],
  ["conference", "event"],
];

/**
 * Words checked in order when no alias matches: the first rule with a word
 * inside the compacted text wins (so "Facebook Ads" is paid_ads). Anything
 * else is "other".
 */
export const LEAD_SOURCE_WORDS: ReadonlyArray<
  readonly [key: LeadSourceKey, words: readonly string[]]
> = [
  ["website", ["אתר", "website"]],
  ["cold_call", ["שיחה", "טלפון", "coldcall"]],
  ["referral", ["המלצה", "referral", "הפניה"]],
  ["paid_ads", ["facebook", "פייסבוק", "google", "גוגל", "paidads", "ppc"]],
  [
    "social_media",
    [
      "instagram",
      "אינסטגרם",
      "linkedin",
      "לינקדאין",
      "socialmedia",
      "רשתותחברתיות",
      "tiktok",
      "טיקטוק",
    ],
  ],
  ["email_campaign", ["אימייל", "email", "מייל", "newsletter"]],
  ["event", ["אירוע", "event", "כנס", "תערוכה"]],
  ["whatsapp", ["whatsapp", "ווטסאפ", "וואטסאפ"]],
];

/** Origin-tag and display label of each key; "other" gets no tag. */
export const LEAD_SOURCE_KEY_LABELS: Record<LeadSourceKey, string> = {
  website: "אתר",
  referral: "הפניה",
  social_media: "רשתות חברתיות",
  paid_ads: "FB",
  cold_call: "שיחה קרה",
  email_campaign: "דיוור",
  event: "אירוע",
  whatsapp: "וואטסאפ",
  other: "אחר",
};

const ALIAS_KEYS = new Map<string, LeadSourceKey>(LEAD_SOURCE_ALIASES);

/** Lower case without spaces, `_ - – —` or quote marks (SQL: same regexp). */
export function compactLeadSource(raw: string | null | undefined): string {
  return (raw ?? "").toLowerCase().replace(/[\s_\-–—'"`״׳]/g, "");
}

/** The fixed key of any stored or sent source text ("FB" → "paid_ads"). */
export function inferLeadSource(raw: string | null | undefined): LeadSourceKey {
  const compact = compactLeadSource(raw);
  if (!compact) {
    return "other";
  }
  const alias = ALIAS_KEYS.get(compact);
  if (alias) {
    return alias;
  }
  const rule = LEAD_SOURCE_WORDS.find(([, words]) =>
    words.some((word) => compact.includes(word)),
  );
  return rule ? rule[0] : "other";
}

/**
 * Whether a lead's source matches a configured one (a list rule, a condition,
 * a switch branch). Known sources compare by key ("facebook" matches "FB"); a
 * configured "other" takes any unknown text, and an unknown configured text
 * takes only that same text.
 */
export function leadSourceMatches(
  wanted: string | null | undefined,
  source: string | null | undefined,
): boolean {
  const key = inferLeadSource(wanted);
  if (key !== inferLeadSource(source)) {
    return false;
  }
  if (key !== "other") {
    return true;
  }
  const want = compactLeadSource(wanted);
  return isNamedOther(want) || want === compactLeadSource(source);
}

function isNamedOther(compact: string): boolean {
  return compact === "" || compact === "other" || compact === "אחר";
}

/**
 * Origin-tag name for a source: the key's label when the source is known,
 * otherwise the text as sent; none for an empty or "other" source.
 */
export function leadSourceTagName(
  raw: string | null | undefined,
): string | null {
  const key = inferLeadSource(raw);
  if (key !== "other") {
    return LEAD_SOURCE_KEY_LABELS[key];
  }
  const text = raw?.trim() ?? "";
  return isNamedOther(compactLeadSource(text)) ? null : text;
}
