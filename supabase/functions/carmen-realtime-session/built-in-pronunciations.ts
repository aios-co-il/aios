import type { Pronunciation } from "./pronunciations.ts";

/**
 * Terms every org's Carmen meets in marketing work, with how to say them in Israeli Hebrew.
 * An org's own entries (carmen_pronunciations, saved when a user corrects her) win over these.
 */
export const BUILT_IN_PRONUNCIATIONS: ReadonlyArray<Pronunciation> = [
  { term: "כרמן", spoken: "כַּרְמֶן" },
  { term: "AI", spoken: "אֵיי-אַיי" },
  { term: "Meta", spoken: "מֶטָה" },
  { term: "Facebook", spoken: "פֵייסְבּוּק" },
  { term: "Instagram", spoken: "אִינְסְטָגְרָם" },
  { term: "TikTok", spoken: "טִיקְטוֹק" },
  { term: "WhatsApp", spoken: "ווֹטְסְאַפּ" },
  { term: "Google Ads", spoken: "גוּגֶל אַדְס" },
  { term: "Shopify", spoken: "שׁוֹפִּיפַיי" },
  { term: "CRM", spoken: "סִי-אַר-אֶם" },
  { term: "SEO", spoken: "אֶס-אִי-אוֹ" },
  { term: "PPC", spoken: "פִּי-פִּי-סִי" },
  { term: "KPI", spoken: "קֵיי-פִּי-אַיי" },
  { term: "ROI", spoken: "אַר-אוֹ-אַיי" },
  { term: "ROAS", spoken: "רוֹאַס" },
  { term: "CTR", spoken: "סִי-טִי-אַר" },
  { term: "CPC", spoken: "סִי-פִּי-סִי" },
  { term: "CPL", spoken: "סִי-פִּי-אֶל" },
  { term: "CPM", spoken: "סִי-פִּי-אֶם" },
  { term: "CPA", spoken: "סִי-פִּי-אֵיי" },
  { term: "B2B", spoken: "בִּי-טוּ-בִּי" },
  { term: "B2C", spoken: "בִּי-טוּ-סִי" },
  { term: "ליד", spoken: "לִיד (פְּנִיָּה שֶׁל לָקוֹחַ)" },
  { term: "לידים", spoken: "לִידִים" },
  { term: "קמפיין", spoken: "קַמְפֵּיין" },
  { term: "קמפיינים", spoken: "קַמְפֵּיינִים" },
  { term: "קמפיינר", spoken: "קַמְפֵּיינֶר" },
  { term: "קריאייטיב", spoken: "קְרִיאֵייטִיב" },
  { term: "דשבורד", spoken: "דֶּשְׁבּוֹרְד" },
  { term: "פאנל", spoken: "פָאנֶל" },
  { term: "landing page", spoken: "לֶנְדִינְג פֵּייג'" },
  { term: "remarketing", spoken: "רִימַרְקֶטִינְג" },
  { term: "email", spoken: "אִימֵייל" },
];
