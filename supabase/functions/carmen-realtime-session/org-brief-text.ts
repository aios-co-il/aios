import type { BriefMember, OrgBrief } from "./org-brief.ts";

/**
 * The brief as voice instructions: what she can answer at once, what she can do (and through
 * which tool), and today's conversations. Live numbers still come from ask_carmen.
 */
export function orgBriefInstructions(brief: OrgBrief): string {
  const sections = [
    "=== היכולות שלך ===",
    "- דרך ask_carmen: נתונים חיים ופעולות במערכת — לקוחות, לידים, משימות, קמפיינים וביצועים, דוחות, יומן, זיכרון, ושליחת וואטסאפ לכל אחד: ללקוחות, לצוות, למשתמש עצמו ולכל מספר או איש קשר (את המספר מוצאים ב-find_contact).",
    "- לעולם אל תגידי שאין לך יכולת או חיבור לפני שביקשת את זה מ-ask_carmen. בקשה לפעולה עוברת אליו במלואה, ועונים רק לפי מה שחזר.",
    "- באפליקציה בטלפון יש לך גם: חיפוש אנשי קשר, חיוג, שליטה במדיה, ושליחת וואטסאפ לאיש קשר ב-send_whatsapp מהוואטסאפ של המשתמש או מהמספר שלך, לפי מה שביקש. שם שליחה לאיש קשר מהטלפון עוברת ב-send_whatsapp ולא דרך ask_carmen.",
    "- מה שכתוב למטה על הארגון והשיחות של היום את כבר יודעת: עני ממנו מיד, בלי ask_carmen. למספרים, סטטוסים ופעולות קראי ל-ask_carmen.",
    "=== הארגון ===",
    ...agencyLines(brief),
    ...teamLines(brief.team),
  ];
  if (brief.today.length > 0) {
    sections.push(
      "=== מה כבר דובר היום ===",
      ...brief.today.map((s) => `- ${s}`),
      "התייחסי לזה כשזה רלוונטי, ואל תשאלי שוב על מה שכבר נאמר.",
    );
  }
  return sections.join("\n");
}

/** One line per agency with its clients, then clients that belong to no agency. */
function agencyLines({ agencies, otherClients }: OrgBrief): Array<string> {
  if (agencies.length === 0 && otherClients.length === 0) {
    return ["- אין סוכנויות או לקוחות רשומים."];
  }
  const lines = agencies.map((a) => {
    const label = a.shared ? `${a.name} (סוכנות משותפת)` : a.name;
    const clients =
      a.clients.length > 0 ? a.clients.join(", ") : "אין לקוחות פעילים";
    return `- סוכנות ${label}: ${clients}`;
  });
  if (otherClients.length > 0) {
    lines.push(`- לקוחות בלי סוכנות: ${otherClients.join(", ")}`);
  }
  lines.push(
    "שמרי על ההפרדה: כל לקוח שייך לסוכנות שלו בלבד, ואל תערבבי בין סוכנויות.",
  );
  return lines;
}

/** The team as one line per person, with roles. */
function teamLines(team: Array<BriefMember>): Array<string> {
  if (team.length === 0) {
    return [];
  }
  return [
    "צוות וקמפיינרים:",
    ...team.map((m) =>
      m.roles.length > 0
        ? `- ${m.name} (${m.roles.join(", ")})`
        : `- ${m.name}`,
    ),
  ];
}
