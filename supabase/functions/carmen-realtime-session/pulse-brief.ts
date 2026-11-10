import type { BriefScope } from "../_shared/carmen/org-brief/brief.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

/** One client's latest campaign pulse, as the voice reads it out. */
export type PulseLine = {
  client: string;
  agency: string | null;
  status: string;
  isEcommerce: boolean;
  spend: number | null;
  leads: number | null;
  cpl: number | null;
  cplChangePct: number | null;
  purchases: number | null;
  roas: number | null;
};

/** The pulse the voice knows at the start of a call: one line per client, and when it ran. */
export type PulseBrief = { calculatedAt: string; lines: Array<PulseLine> };

// The pulse runs daily; an older snapshot is no longer "the current state".
const FRESH_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_ROWS = 1000;
const STATUS_ORDER = ["critical", "warning", "healthy", "no_data"];

const LOG = "[carmen-realtime-session]";

/**
 * The latest campaign pulse snapshot per client in the caller's scope (`voiceBriefScope`), so
 * Carmen answers "how is X doing" at once instead of asking her brain for live data. Never
 * throws: on a failed read, none.
 */
export async function loadPulseBrief(
  db: DbClient,
  tenantId: string,
  scope: BriefScope,
  now: Date = new Date(),
): Promise<PulseBrief | null> {
  if (scope.kind === "clients" && scope.clientIds.length === 0) {
    return null;
  }
  let query = db
    .from("campaign_pulse_snapshots")
    .select(
      "client_id, calculated_at, status, is_ecommerce, spend_7d, leads_7d, cpl_7d, cpl_change_pct, purchases_7d, roas_7d, clients(name), agencies(name)",
    )
    .eq("tenant_id", tenantId)
    .gte("calculated_at", new Date(now.getTime() - FRESH_MS).toISOString())
    .order("calculated_at", { ascending: false })
    .limit(MAX_ROWS);
  if (scope.kind === "clients") {
    query = query.in("client_id", scope.clientIds);
  } else if (scope.kind === "agencies") {
    query = query.in("agency_id", scope.agencyIds);
  }
  const { data, error } = await query;
  if (error) {
    console.error(`${LOG} pulse read failed`, error.message);
    return null;
  }
  const latest = new Map<string, NonNullable<typeof data>[number]>();
  for (const row of data ?? []) {
    if (row.client_id && !latest.has(row.client_id)) {
      latest.set(row.client_id, row);
    }
  }
  if (latest.size === 0) {
    return null;
  }
  const rows = [...latest.values()];
  return {
    calculatedAt: rows[0].calculated_at,
    lines: rows
      .map((row) => ({
        client: row.clients?.name ?? "לקוח",
        agency: row.agencies?.name ?? null,
        status: row.status,
        isEcommerce: row.is_ecommerce === true,
        spend: num(row.spend_7d),
        leads: num(row.leads_7d),
        cpl: num(row.cpl_7d),
        cplChangePct: num(row.cpl_change_pct),
        purchases: num(row.purchases_7d),
        roas: num(row.roas_7d),
      }))
      .sort(byStatus),
  };
}

/**
 * The pulse as voice instructions: one short line per client, problems first, and that she
 * answers status questions from it without her brain.
 */
export function pulseBriefInstructions(brief: PulseBrief): string {
  return [
    `=== דופק הקמפיינים (7 ימים, עודכן ${israelTime(brief.calculatedAt)}) ===`,
    ...brief.lines.map(pulseLineText),
    "לשאלה על מצב לקוח, סוכנות או בדיקת דופק עני מכאן מיד, בלי ask_carmen. ask_carmen רק לנתון של היום, לפירוט לפי קמפיין, או כשמבקשים במפורש לרענן.",
  ].join("\n");
}

/** One client's pulse in a short spoken-friendly line. */
export function pulseLineText(line: PulseLine): string {
  const status =
    { critical: "🔴", warning: "🟡", healthy: "🟢", no_data: "⚪ אין נתונים" }[
      line.status
    ] ?? line.status;
  const parts: Array<string> = [];
  if (line.isEcommerce) {
    if (line.purchases !== null) {
      parts.push(`${line.purchases} רכישות`);
    }
    if (line.roas !== null) {
      parts.push(`ROAS ${line.roas}`);
    }
  } else {
    if (line.leads !== null) {
      parts.push(`${line.leads} לידים`);
    }
    if (line.cpl !== null) {
      const change =
        line.cplChangePct === null
          ? ""
          : ` (${line.cplChangePct > 0 ? "+" : ""}${Math.round(line.cplChangePct)}%)`;
      parts.push(`₪${Math.round(line.cpl)} לליד${change}`);
    }
  }
  if (line.spend !== null) {
    parts.push(`הוצאה ₪${Math.round(line.spend)}`);
  }
  const agency = line.agency ? ` (${line.agency})` : "";
  return `- ${line.client}${agency}: ${status}${parts.length ? ` ${parts.join(", ")}` : ""}`;
}

/** Problems first, then by name. */
function byStatus(a: PulseLine, b: PulseLine): number {
  return (
    statusRank(a.status) - statusRank(b.status) ||
    a.client.localeCompare(b.client, "he")
  );
}

/** A status's place in STATUS_ORDER; unknown statuses go last. */
function statusRank(status: string): number {
  const i = STATUS_ORDER.indexOf(status);
  return i === -1 ? STATUS_ORDER.length : i;
}

/** A numeric column as a number, or null. */
function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return value === null || value === undefined || Number.isNaN(n) ? null : n;
}

/** When the pulse ran, in Israel time, e.g. "10.11 08:00". */
function israelTime(iso: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
