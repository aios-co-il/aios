import type { BriefMember, OrgBrief } from "./brief.ts";

/**
 * What Carmen knows about the org without a lookup: its agencies with their clients, the team,
 * and what was said today. Voice and the chat's fast lane each add their own rules around it.
 */
export function orgFactsLines(brief: OrgBrief): Array<string> {
  const lines = [
    "=== הארגון ===",
    ...agencyLines(brief),
    ...teamLines(brief.team),
  ];
  if (brief.today.length > 0) {
    lines.push(
      "=== מה כבר דובר היום ===",
      ...brief.today.map((s) => `- ${s}`),
      "התייחסי לזה כשזה רלוונטי, ואל תשאלי שוב על מה שכבר נאמר.",
    );
  }
  return lines;
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
