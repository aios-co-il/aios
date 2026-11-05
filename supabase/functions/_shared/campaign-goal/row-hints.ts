/** A goal a campaign name or a legacy row type hints at, in the pulse's words. */
export type HintedGoal = "ecommerce" | "leads" | "engagement";

/** The goal a campaign's name spells out (מכירות, לידים, סרטון…); null when it does not. */
export function campaignNameGoal(name: unknown): HintedGoal | null {
  const raw = String(name || "").trim();
  if (!raw) {
    return null;
  }
  if (/מכירות|sales|purchase|רכיש/i.test(raw)) {
    return "ecommerce";
  }
  if (
    /ליד|lead|ווטסאפ|וואטסאפ|whatsapp|הודע|message|שיח|conversation/i.test(raw)
  ) {
    return "leads";
  }
  if (/מעורבות|סרטון|video|thruplay|traffic|טראפיק|צפיות|view/i.test(raw)) {
    return "engagement";
  }
  return null;
}

/** The goal of a row's legacy `campaign_type`: Make/webhook rows carry the table type per row. */
export function legacyCampaignTypeGoal(
  campaignType: unknown,
): HintedGoal | null {
  const normalized = String(campaignType || "")
    .trim()
    .toLowerCase();
  if (normalized === "ecommerce") {
    return "ecommerce";
  }
  if (normalized === "traffic") {
    return "engagement";
  }
  if (normalized === "lead") {
    return "leads";
  }
  return null;
}
