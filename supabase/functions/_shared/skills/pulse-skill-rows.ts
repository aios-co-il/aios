// The canonical text of the global pulse_check and ecommerce_pulse skins.
// Migration 20261026131000 writes the same text to ai_skills, which stays the
// owner at runtime; registry.ts renders these rows as its fallback, and
// pulse-skill-rows.test.ts keeps them equal to the migration.

/** A global ai_skills row as the migration writes it. */
export type PulseSkillRow = {
  slug: string;
  name: string;
  description: string;
  goal: string;
  system_prompt: string;
  constraints: string;
  steps: string;
  output_template: string | null;
  allowed_tools: readonly string[];
  triggers: readonly string[];
};

/** Global ai_skills row for slug pulse_check (also the registry fallback). */
export const PULSE_CHECK_SKILL_ROW: PulseSkillRow = Object.freeze({
  slug: "pulse_check",
  name: "בדיקת דופק",
  description:
    "הצגת בדיקת הדופק האחרונה שנשמרה, או רענון שלה כשמבקשים דופק עדכני.",
  goal: "למסור את מצב הקמפיינים של הלקוחות מתוך בדיקת הדופק, בלי לשלוח הודעות ובלי להמציא נתונים.",
  system_prompt: `בקשה ל"דופק" או ל"בדיקת דופק" בלי בקשה לרענן — קראי ל-get_latest_campaign_pulse והציגי את הבדיקה האחרונה שנשמרה.
"רענני דופק", "דופק עדכני" או "בדיקת דופק מלאה ועדכנית" — קראי ל-refresh_campaign_pulse. הכלי מחשב את הדופק מחדש מהנתונים שכבר סונכרנו, לא שולח הודעות, ומרענן לכל היותר פעם ב-10 דקות לארגון; אחרת הוא מחזיר את הבדיקה הקיימת עם זמן החישוב.
הבדיקה כוללת את מועד השיחה הטלפונית האחרונה עם הלקוח שתועדה בכרטיס הלקוח ומי תיעד אותה, והתראה כשלא תועדה שיחה ב-14 הימים האחרונים. עדכון שבועי שאומר בחיוב שהקמפיינר דיבר עם הלקוח בטלפון נחשב שיחה; ניסוח שלילי כמו "לא הצלחתי לדבר" לא נחשב.
הבדיקה כוללת גם התראות קריטיות פתוחות (קמפיין שנעצר, מודעה שנדחתה) ללקוחות שטבלת הקמפיין שלהם פעילה.
לקמפיינרים הכלים מסננים אוטומטית ללקוחות המשויכים להם.
"בדיקת תקינות" היא health probe — לא דופק.`,
  constraints: `המקור היחיד למספרי הדופק הוא get_latest_campaign_pulse או refresh_campaign_pulse. אסור להשלים נתונים מהזיכרון, ואסור להריץ analyze_campaign_performance או check_ad_accounts_health במקום הדופק. בוואטסאפ אסור טבלאות — רק whatsapp_digest כלשונו. רענון לא שולח הודעות ולא מחליף אישור לשינוי בקמפיין.`,
  steps: `1. בקשה בלי רענון — get_latest_campaign_pulse, בלי מסנן אלא אם צוינו לקוח או סוכנות.
2. בקשה לרענון או לדופק עדכני — refresh_campaign_pulse, עם client_id או client_name כשמדובר בלקוח אחד.
3. בוואטסאפ — הדביקי את whatsapp_digest כלשונו, כולל בלוק ההתראות הקריטיות. אחרי רענון פתחי בשורת refresh_note.
4. בדשבורד הפנימי — אפשר להציג את formatted_markdown.
5. אם count=0 — אמרי שאין בדיקת דופק שמורה והציעי לרענן.`,
  output_template: `בוואטסאפ — whatsapp_digest מהכלי בלבד (סיכום סטטוסים, בלוק "🔴 דורש טיפול" כשקיים וקישור לדשבורד); אחרי רענון, שורת refresh_note לפניו.
אסור: טבלת Markdown, רשימת לקוחות מלאה, או משפט על מה נמצא בדשבורד.`,
  allowed_tools: ["get_latest_campaign_pulse", "refresh_campaign_pulse"],
  triggers: [
    "בדיקת דופק",
    "בדיקת דוח",
    "סיכום קמפיינים",
    "מצב קמפיינים",
    "pulse check",
    "דופק עדכני",
    "רענני דופק",
    "רענון דופק",
  ],
});

/** Global ai_skills row for slug ecommerce_pulse (also the registry fallback). */
export const ECOMMERCE_PULSE_SKILL_ROW: PulseSkillRow = Object.freeze({
  slug: "ecommerce_pulse",
  name: "דופק איקומרס",
  description:
    "קריאת הדופק של לקוחות איקומרס לפי רכישות, הכנסות ו-ROAS ולא לפי עלות לליד.",
  goal: "לדווח על לקוחות איקומרס לפי מדדי המכירות שלהם מתוך בדיקת הדופק.",
  system_prompt: `ללקוחות איקומרס (is_ecommerce=true, או יעד ecommerce בדופק) מודדים רכישות, הכנסות ו-ROAS — purchases_7d, revenue_7d, roas_7d ו-roas_change_pct — ולא CPL.
הנתונים מגיעים מ-get_latest_campaign_pulse, או מ-refresh_campaign_pulse כשמבקשים דופק עדכני.
ניתוח מעמיק ללקוח אחד, כשמבקשים אותו — analyze_campaign_performance עם client_id.
אין כלי שקורא הזמנות ישירות מ-Shopify או מ-WooCommerce. אל תציעי כלי כזה ואל תמציאי נתוני הזמנות.`,
  constraints: `כל מספר מגיע מפלט הכלים. אסור לחשב מדד שלא הופיע בפלט, ואסור להציג CPL כמדד ההצלחה של לקוח איקומרס.`,
  steps: `1. get_latest_campaign_pulse (או refresh_campaign_pulse כשביקשו דופק עדכני) עם הלקוח או הסוכנות שצוינו.
2. ללקוחות איקומרס — דווחי רכישות, הכנסות ו-ROAS ואת השינוי ב-ROAS.
3. ניתוח מעמיק ללקוח אחד — analyze_campaign_performance עם client_id.`,
  output_template: null,
  allowed_tools: [
    "get_latest_campaign_pulse",
    "refresh_campaign_pulse",
    "analyze_campaign_performance",
  ],
  triggers: ["איקומרס", "ecommerce", "e-commerce", "רכישות", "roas", "cpp"],
});
