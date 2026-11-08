import { z } from "npm:zod@3.25.76";
import { buildPulseRefreshNote, type PulseRefreshStatus } from "./note.ts";

/** get_latest_campaign_pulse's answer; the refresh reads these fields. */
const pulsePayloadSchema = z.object({count:z.number().optional(), freshness:z.string().nullish(), instructions_to_agent:z.string().nullish()}).passthrough();
export type PulsePayload = z.infer<typeof pulsePayloadSchema>;
/** Validate fields the refresh consumes while retaining the full pulse answer. */
export function readPulsePayload(value: unknown): PulsePayload | null {
 const parsed = pulsePayloadSchema.safeParse(value);
 return parsed.success ? parsed.data : null;
}

/** How the refresh went, as the tool result's `refresh` field shows it. */
export type RefreshRecord = {
  status: PulseRefreshStatus;
  previous_calculated_at: string | null;
  min_interval_minutes: number;
  clients?: number | null;
  error?: string;
};

/** The pulse with the refresh record, its note and the agent instructions. */
export function withRefreshNote(
  pulse: PulsePayload,
  refresh: RefreshRecord,
  now: Date,
): PulsePayload {
  const refreshed = refresh.status === "refreshed";
  return {
    ...pulse,
    auto_refreshed: refreshed,
    refresh,
    refresh_note: buildPulseRefreshNote(refresh.status, {
      freshness: pulse.freshness ?? null,
      now,
    }),
    instructions_to_agent: [
      "פתחי בשורת refresh_note כלשונה.",
      refreshed
        ? null
        : "הרענון לא רץ עכשיו: אל תטעני שהנתונים חושבו מחדש, ואל תקראי שוב ל-refresh_campaign_pulse באותה שיחה.",
      pulseInstructions(pulse, refreshed),
    ]
      .filter(Boolean)
      .join(" "),
  };
}

/**
 * The pulse's own instructions. get_latest_campaign_pulse's empty answer
 * forbids creating a new check, which does not fit the refresh tool itself.
 */
function pulseInstructions(
  pulse: PulsePayload,
  refreshed: boolean,
): string | null {
  if (pulse.count !== 0) {
    return pulse.instructions_to_agent || null;
  }
  return refreshed
    ? "הרענון רץ, אבל לא נמצאה בדיקת דופק ללקוחות שבהרשאה שלך. אמרי זאת, בלי להמציא נתונים ובלי להריץ כלי חלופי."
    : "אין בדיקת דופק שמורה. אמרי זאת לפי refresh_note, בלי להמציא נתונים ובלי להריץ כלי חלופי.";
}
